import PropTypes from "prop-types";
import PropTypes from "prop-types";
import React, { Component } from "react";
import React, { Component } from "react";
import { StyleSheet, View, ViewPropTypes } from "react-native";
import { StyleSheet, View, ViewPropTypes } from "react-native";
import { WebView } from "react-native-webview";
import { WebView } from "react-native-webview";

import htmlContent from "./injectedHtml";
import injectedApplication from "./injectedJavaScript/application";
import injectedErrorHandler from "./injectedJavaScript/errorHandler";
import injectedExecuteNativeFunction from "./injectedJavaScript/executeNativeFunction";
import injectedSignaturePad from "./injectedJavaScript/signaturePad";

export default class SignaturePad extends Component {
  static propTypes = {
    onChange: PropTypes.func,
    onError: PropTypes.func,
    style: ViewPropTypes.style,
    penColor: PropTypes.string,
    dataURL: PropTypes.string,
  };

  static defaultProps = {
    onChange: () => {},
    onError: () => {},
    style: {},
  };

  constructor(props) {
    super(props);

    const { backgroundColor } = StyleSheet.flatten(props.style);
    var injectedJavaScript =
      injectedExecuteNativeFunction +
      injectedErrorHandler +
      injectedSignaturePad +
      injectedApplication(props.penColor, backgroundColor, props.dataURL);

    var html = htmlContent(injectedJavaScript); //We don't use WebView's injectedJavaScript because on Android, the WebView re-injects the JavaScript upon every url change. Given that we use url changes to communicate signature changes to the React Native app, the JS is re-injected every time a stroke is drawn.
    this.state = {
      base64DataUrl: props.dataURL || null,
      key: 1,
    };
    this.source = { html };
  }

  _onNavigationChange = (args) => {
    this._parseMessageFromWebViewNavigationChange(unescape(args.url));
  };

  _parseMessageFromWebViewNavigationChange = (newUrl) => {
    //Example input:
    //applewebdata://4985ECDA-4C2B-4E37-87ED-0070D14EB985#executeFunction=jsError&arguments=%7B%22message%22:%22ReferenceError:%20Can't%20find%20variable:%20WHADDUP%22,%22url%22:%22applewebdata://4985ECDA-4C2B-4E37-87ED-0070D14EB985%22,%22line%22:340,%22column%22:10%7D"
    //All parameters to the native world are passed via a hash url where every parameter is passed as &[ParameterName]<-[Content]&
    var hashUrlIndex = newUrl.lastIndexOf("#");
    if (hashUrlIndex === -1) {
      return;
    }

    var hashUrl = newUrl.substring(hashUrlIndex);
    hashUrl = decodeURIComponent(hashUrl);
    var regexFindAllSubmittedParameters = /&(.*?)&/g;

    var parameters = {};
    var parameterMatch = regexFindAllSubmittedParameters.exec(hashUrl);
    if (!parameterMatch) {
      return;
    }

    while (parameterMatch) {
      var parameterPair = parameterMatch[1]; //For example executeFunction=jsError or arguments=...

      var parameterPairSplit = parameterPair.split("<-");
      if (parameterPairSplit.length === 2) {
        parameters[parameterPairSplit[0]] = parameterPairSplit[1];
      }

      parameterMatch = regexFindAllSubmittedParameters.exec(hashUrl);
    }

    if (!this._attemptToExecuteNativeFunctionFromWebViewMessage(parameters)) {
      logger.warn(
        { parameters, hashUrl },
        "Received an unknown set of parameters from WebView"
      );
    }
  };

  _attemptToExecuteNativeFunctionFromWebViewMessage = (message) => {
    if (message.executeFunction && message.arguments) {
      var parsedArguments = JSON.parse(message.arguments);

      var referencedFunction = this["_bridged_" + message.executeFunction];
      if (typeof referencedFunction === "function") {
        referencedFunction.apply(this, [parsedArguments]);
        return true;
      }
    }

    return false;
  };

  _bridged_jsError = (args) => {
    this.props.onError({ details: args });
  };

  _bridged_finishedStroke = ({ base64DataUrl }) => {
    this.props.onChange({ base64DataUrl });
    this.setState({ base64DataUrl });
  };

  _renderError = (args) => {
    this.props.onError({ details: args });
  };

  _renderLoading = (args) => {};

  onMessage = (event) => {
    var base64DataUrl = JSON.parse(event.nativeEvent.data);
    this._bridged_finishedStroke(base64DataUrl);
  };

  reload = () => {
    this.setState({ key: this.state.key + 1 });
  };

  getBase64Data = () => {
    return this.state.base64DataUrl;
  };

  render = () => {
    return (
      <WebView
        key={this.state.key} //for reload webview
        ref={(ref) => (this.web = ref)}
        onNavigationStateChange={this._onNavigationChange}
        onMessage={this.onMessage}
        renderError={this._renderError}
        renderLoading={this._renderLoading}
        source={this.source}
        javaScriptEnabled={true}
        startInLoadingState={true}
        style={this.props.style}
      />
    );
  };
}
