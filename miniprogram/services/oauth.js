const appConfig = require("../config");

const STORAGE_KEY = "chatgpt_oauth_session";

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
    label: "Prototype OAuth Demo"
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
              reject(new Error(data.error || "Unable to connect ChatGPT OAuth."));
              return;
            }

            const session = {
              provider: oauthConfig.providerName,
              accessToken: data.access_token,
              tokenType: data.token_type || "Bearer",
              expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
              refreshToken: data.refresh_token || "",
              mode: "oauth",
              label: "ChatGPT OAuth"
            };

            saveOAuthSession(session);
            resolve(session);
          },
          fail() {
            reject(new Error("Unable to reach the OAuth backend."));
          }
        });
      },
      fail() {
        reject(new Error("Unable to start WeChat login for OAuth handoff."));
      }
    });
  });
}

function hasUsableOAuth(session) {
  return Boolean(session && session.accessToken && (!session.expiresAt || session.expiresAt > Date.now()));
}

module.exports = {
  clearOAuthSession,
  connectChatGPT,
  hasUsableOAuth,
  loadOAuthSession
};
