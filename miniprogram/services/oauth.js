const appConfig = require("../config");
const {
  callCloudRun,
  hasCloudRun
} = require("./cloudrun");

const STORAGE_KEY = "reading_backend_session";

function loadReadingBackendSession() {
  return wx.getStorageSync(STORAGE_KEY) || null;
}

function saveReadingBackendSession(session) {
  wx.setStorageSync(STORAGE_KEY, session);
}

function clearReadingBackendSession() {
  wx.removeStorageSync(STORAGE_KEY);
}

function connectReadingBackend() {
  const oauthConfig = appConfig.oauth;

  if (hasCloudRun(appConfig.cloudRun) && oauthConfig.tokenExchangePath) {
    return exchangeCloudRunToken(oauthConfig)
      .catch((error) => {
        if (oauthConfig.tokenExchangeEndpoint) {
          return exchangeToken(oauthConfig);
        }

        throw error;
      });
  }

  if (oauthConfig.tokenExchangeEndpoint) {
    return exchangeToken(oauthConfig);
  }

  return Promise.reject(new Error("解读后端未配置。"));
}

function exchangeToken(oauthConfig) {
  return new Promise((resolve, reject) => {
    wx.login({
      success(loginResult) {
        wx.request({
          url: oauthConfig.tokenExchangeEndpoint,
          method: "POST",
          data: {
            provider: oauthConfig.providerName,
            loginCode: loginResult.code,
            authorizeUrl: oauthConfig.authorizeUrl
          },
          success(response) {
            const data = response.data || {};

            if (response.statusCode < 200 || response.statusCode >= 300 || !data.access_token) {
              reject(new Error(data.error || "无法连接 AI 解读后端。"));
              return;
            }

            const session = {
              backend: data.provider || oauthConfig.providerName,
              accessToken: data.access_token,
              tokenType: data.token_type || "Bearer",
              expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
              refreshToken: data.refresh_token || "",
              mode: data.mode || "backend",
              modelConfigured: data.model_configured !== false,
              model: data.model || "",
              label: data.label || "云端解读服务",
              transport: "https"
            };

            saveReadingBackendSession(session);
            resolve(session);
          },
          fail(error) {
            reject(new Error(formatRequestError("无法访问 AI 解读后端", error)));
          }
        });
      },
      fail(error) {
        reject(new Error(formatRequestError("无法启动微信登录以连接后端", error)));
      }
    });
  });
}

function exchangeCloudRunToken(oauthConfig) {
  return new Promise((resolve, reject) => {
    wx.login({
      success(loginResult) {
        callCloudRun({
          path: oauthConfig.tokenExchangePath,
          method: "POST",
          data: {
            provider: oauthConfig.providerName,
            loginCode: loginResult.code,
            authorizeUrl: oauthConfig.authorizeUrl
          }
        })
          .then((response) => {
            const data = response.data || {};

            if (response.statusCode < 200 || response.statusCode >= 300 || !data.access_token) {
              reject(new Error(data.error || "无法连接微信云托管解读后端。"));
              return;
            }

            const session = {
              backend: data.provider || oauthConfig.providerName,
              accessToken: data.access_token,
              tokenType: data.token_type || "Bearer",
              expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
              refreshToken: data.refresh_token || "",
              mode: data.mode || "backend",
              modelConfigured: data.model_configured !== false,
              model: data.model || "",
              label: data.label || "微信云托管解读服务",
              transport: "cloudRun"
            };

            saveReadingBackendSession(session);
            resolve(session);
          })
          .catch((error) => {
            reject(new Error(formatRequestError("无法访问微信云托管解读后端", error)));
          });
      },
      fail(error) {
        reject(new Error(formatRequestError("无法启动微信登录以连接后端", error)));
      }
    });
  });
}

function hasUsableOAuth(session) {
  return Boolean(session && session.accessToken && (!session.expiresAt || session.expiresAt > Date.now()));
}

function formatRequestError(message, error) {
  if (error && error.errMsg) {
    return `${message}: ${error.errMsg}`;
  }

  return message;
}

module.exports = {
  clearReadingBackendSession,
  connectReadingBackend,
  hasUsableOAuth,
  loadReadingBackendSession
};
