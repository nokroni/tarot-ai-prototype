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
    label: "Prototype Backend Demo"
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
              reject(new Error(data.error || "Unable to connect the AI reading backend."));
              return;
            }

            const session = {
              provider: data.provider || oauthConfig.providerName,
              accessToken: data.access_token,
              tokenType: data.token_type || "Bearer",
              expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
              refreshToken: data.refresh_token || "",
              mode: data.mode || "backend",
              label: data.label || "AI Reading Backend"
            };

            saveOAuthSession(session);
            resolve(session);
          },
          fail(error) {
            reject(new Error(formatRequestError("Unable to reach the AI reading backend", error)));
          }
        });
      },
      fail(error) {
        reject(new Error(formatRequestError("Unable to start WeChat login for backend auth", error)));
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
