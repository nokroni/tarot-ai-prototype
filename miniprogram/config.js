const backendBaseUrl = "http://127.0.0.1:8787";

module.exports = {
  oauth: {
    providerName: "AI Reading Backend",
    // Use an HTTPS tunnel URL here for phone testing. Localhost works only in
    // WeChat DevTools with domain verification disabled.
    authorizeUrl: "",
    tokenExchangeEndpoint: `${backendBaseUrl}/auth/wechat`,
    readingEndpoint: `${backendBaseUrl}/readings`
  }
};
