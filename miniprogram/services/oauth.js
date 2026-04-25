const appConfig = require("../config");

const STORAGE_KEY = "ai_backend_session";

function loadOAuthSession() {
  return wx.getStorageSync(STORAGE_KEY) || null;
}

function saveOAuthSession(session) {
  wx.setStorageSync(STORAGE_KEY, session);
}

function clearOAuthSession() {
  wx.removeStorageSync(STORAGE_KEY);
}

function connectChatGPT() {
  const oauthConfig = appConfig.oauth;

  if (oauthConfig.tokenExchangeEndpoint) {
    return exchangeToken(oauthConfig);
  }

  const session = {
    provider: oauthConfig.providerName,
    accessToken: `prototype-${Date.now()}`,
    tokenType: "Bearer",
    expiresAt: Date.now() + 60 * 60 * 1000,
    mode: "demo",
    label: "原型后端演示"
  };

  saveOAuthSession(session);
  return Promise.resolve(session);
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
              provider: data.provider || oauthConfig.providerName,
              accessToken: data.access_token,
              tokenType: data.token_type || "Bearer",
              expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
              refreshToken: data.refresh_token || "",
              mode: data.mode || "backend",
              openaiConfigured: data.openai_configured !== false,
              model: data.model || "",
              label: data.label || "AI 解读后端"
            };

            saveOAuthSession(session);
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
  clearOAuthSession,
  connectChatGPT,
  hasUsableOAuth,
  loadOAuthSession
};
