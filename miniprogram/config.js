const backendBaseUrl = "https://muse-ai.cloud";

module.exports = {
  cloudAI: {
    enabled: true,
    envId: "tarot-d9g2gcdx1cec4d83e",
    provider: "hunyuan-exp",
    model: "hunyuan-2.0-instruct-20251111",
    sourceLabel: "CloudBase Hunyuan"
  },
  oauth: {
    providerName: "HTTPS Fallback Backend",
    // Ubuntu-hosted HTTPS backend for phone preview and DevTools testing.
    authorizeUrl: "",
    tokenExchangeEndpoint: `${backendBaseUrl}/auth/wechat`,
    readingEndpoint: `${backendBaseUrl}/readings`
  }
};
