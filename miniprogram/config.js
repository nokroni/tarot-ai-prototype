const cloudRunBaseUrl = "https://express-6a5b-251593-6-1425965613.sh.run.tcloudbase.com";
const backendBaseUrl = cloudRunBaseUrl;
const assetBaseUrl = `${cloudRunBaseUrl}/assets/tarot`;

module.exports = {
  assets: {
    baseUrl: assetBaseUrl
  },
  cloudRun: {
    enabled: true,
    envId: "prod-d0g9v713d07a202a0",
    serviceName: "express-6a5b",
    baseUrl: cloudRunBaseUrl
  },
  cloudAI: {
    enabled: true,
    envId: "tarot-d9g2gcdx1cec4d83e",
    provider: "hunyuan-exp",
    model: "hunyuan-2.0-instruct-20251111",
    sourceLabel: "AI生成内容，仅供娱乐和自我反思",
    modelOverrides: {
      rahdueWheel: "hunyuan-2.0-thinking-20251109"
    },
    sourceLabelOverrides: {
      rahdueWheel: "AI生成内容，仅供娱乐和自我反思 · Rahdue实验"
    }
  },
  oauth: {
    providerName: "微信云托管备用后端",
    authorizeUrl: "",
    tokenExchangePath: "/auth/wechat",
    tokenExchangeEndpoint: `${backendBaseUrl}/auth/wechat`,
    readingPath: "/readings",
    readingEndpoint: `${backendBaseUrl}/readings`
  }
};
