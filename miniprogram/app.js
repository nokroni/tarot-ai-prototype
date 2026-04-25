const appConfig = require("./config");

App({
  onLaunch() {
    if (appConfig.cloudAI && appConfig.cloudAI.envId && wx.cloud && wx.cloud.init) {
      wx.cloud.init({
        env: appConfig.cloudAI.envId
      });
    }
  },

  globalData: {
    appName: "AI 塔罗"
  }
});
