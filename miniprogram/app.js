const appConfig = require("./config");

App({
  onLaunch() {
    const cloudEnvId =
      (appConfig.cloudAI && appConfig.cloudAI.envId) ||
      (appConfig.cloudRun && appConfig.cloudRun.envId);

    if (cloudEnvId && wx.cloud && wx.cloud.init) {
      wx.cloud.init({
        env: cloudEnvId
      });
    }
  },

  globalData: {
    appName: "AI 塔罗"
  }
});
