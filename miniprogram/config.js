const backendBaseUrl = "https://muse-ai.cloud";

module.exports = {
  oauth: {
    providerName: "AI Reading Backend",
    // Ubuntu-hosted HTTPS backend for phone preview and DevTools testing.
    authorizeUrl: "",
    tokenExchangeEndpoint: `${backendBaseUrl}/auth/wechat`,
    readingEndpoint: `${backendBaseUrl}/readings`
  }
};
