const backendBaseUrl = "http://182.254.172.179";

module.exports = {
  oauth: {
    providerName: "AI Reading Backend",
    // This is the Ubuntu-hosted test backend. WeChat DevTools must allow
    // non-verified request domains while this remains plain HTTP.
    authorizeUrl: "",
    tokenExchangeEndpoint: `${backendBaseUrl}/auth/wechat`,
    readingEndpoint: `${backendBaseUrl}/readings`
  }
};
