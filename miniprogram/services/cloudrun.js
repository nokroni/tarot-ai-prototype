const appConfig = require("../config");

function hasCloudRun(config) {
  return Boolean(
    config &&
      config.enabled &&
      config.envId &&
      config.serviceName &&
      typeof wx !== "undefined" &&
      wx.cloud &&
      wx.cloud.callContainer
  );
}

function callCloudRun(options) {
  const cloudRunConfig = appConfig.cloudRun || {};

  if (!hasCloudRun(cloudRunConfig)) {
    return Promise.reject(new Error("微信云托管未初始化。"));
  }

  return new Promise((resolve, reject) => {
    wx.cloud.callContainer({
      config: {
        env: cloudRunConfig.envId
      },
      path: options.path || "/",
      method: options.method || "GET",
      timeout: options.timeout,
      data: options.data,
      dataType: options.dataType,
      responseType: options.responseType,
      header: Object.assign({}, options.header, {
        "X-WX-SERVICE": cloudRunConfig.serviceName
      }),
      success: resolve,
      fail: reject
    });
  });
}

module.exports = {
  callCloudRun,
  hasCloudRun
};
