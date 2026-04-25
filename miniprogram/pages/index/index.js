const appConfig = require("../../config");
const {
  createCloudBaseReading,
  hasCloudBaseAI
} = require("../../services/cloudbase-ai");
const {
  createFallbackReading,
  createReadingRequest,
  normalizeReading,
  readingJsonSchema
} = require("../../services/reading-schema");
const {
  clearOAuthSession,
  connectChatGPT,
  hasUsableOAuth,
  loadOAuthSession
} = require("../../services/oauth");

const spreads = [
  {
    id: "oneCard",
    title: "One Card",
    positions: ["Guidance"]
  },
  {
    id: "threeCard",
    title: "Three Cards",
    positions: ["Situation", "Challenge", "Advice"]
  }
];

const READING_START_ATTEMPTS = 2;
const READING_START_RECOVERY_ATTEMPTS = 4;
const READING_REQUEST_TIMEOUT_MS = 30000;
const READING_POLL_TIMEOUT_MS = 180000;
const READING_RETRY_DELAY_MS = 900;
const READING_POLL_DELAY_MS = 1500;
const cloudAIEnabled = hasCloudBaseAI(appConfig.cloudAI);
const cardFaceMap = {
  the_fool: "/images/thefool.jpeg",
  the_magician: "/images/themagician.jpeg",
  the_high_priestess: "/images/thehighpriestess.jpeg",
  the_empress: "/images/theempress.jpeg",
  the_emperor: "/images/theemperor.jpeg",
  the_hierophant: "/images/thehierophant.jpeg",
  the_lovers: "/images/TheLovers.jpg",
  the_chariot: "/images/thechariot.jpeg",
  strength: "/images/thestrength.jpeg",
  the_hermit: "/images/thehermit.jpeg",
  wheel_of_fortune: "/images/wheeloffortune.jpeg",
  justice: "/images/justice.jpeg",
  the_hanged_man: "/images/thehangedman.jpeg",
  death: "/images/death.jpeg",
  temperance: "/images/temperance.jpeg",
  the_devil: "/images/thedevil.jpeg",
  the_tower: "/images/thetower.jpeg",
  the_star: "/images/thestar.jpeg",
  the_moon: "/images/themoon.jpeg",
  the_sun: "/images/thesun.jpeg",
  judgement: "/images/judgement.jpeg",
  the_world: "/images/theworld.jpeg"
};

const tarotDeck = [
  {
    id: "the_fool",
    name: "The Fool",
    arcana: "Major Arcana",
    uprightMeanings: ["new beginnings", "faith", "spontaneity", "adventure"],
    reversedMeanings: ["recklessness", "hesitation", "naivety", "poor planning"]
  },
  {
    id: "the_magician",
    name: "The Magician",
    arcana: "Major Arcana",
    uprightMeanings: ["manifestation", "skill", "focus", "resourcefulness"],
    reversedMeanings: ["manipulation", "scattered energy", "unused potential"]
  },
  {
    id: "the_high_priestess",
    name: "The High Priestess",
    arcana: "Major Arcana",
    uprightMeanings: ["intuition", "mystery", "inner wisdom", "subconscious"],
    reversedMeanings: ["secrets", "blocked intuition", "confusion"]
  },
  {
    id: "the_empress",
    name: "The Empress",
    arcana: "Major Arcana",
    uprightMeanings: ["abundance", "creativity", "nurturing", "growth"],
    reversedMeanings: ["stagnation", "overgiving", "creative block"]
  },
  {
    id: "the_emperor",
    name: "The Emperor",
    arcana: "Major Arcana",
    uprightMeanings: ["structure", "authority", "discipline", "stability"],
    reversedMeanings: ["control issues", "rigidity", "lack of structure"]
  },
  {
    id: "the_hierophant",
    name: "The Hierophant",
    arcana: "Major Arcana",
    uprightMeanings: ["tradition", "teaching", "community", "shared values"],
    reversedMeanings: ["dogma", "nonconformity", "stale advice", "questioning rules"]
  },
  {
    id: "the_lovers",
    name: "The Lovers",
    arcana: "Major Arcana",
    uprightMeanings: ["choice", "alignment", "relationship", "values"],
    reversedMeanings: ["misalignment", "difficult choice", "imbalance"]
  },
  {
    id: "the_chariot",
    name: "The Chariot",
    arcana: "Major Arcana",
    uprightMeanings: ["momentum", "willpower", "direction", "self-control"],
    reversedMeanings: ["forcefulness", "scattered effort", "stalling", "inner conflict"]
  },
  {
    id: "strength",
    name: "Strength",
    arcana: "Major Arcana",
    uprightMeanings: ["courage", "patience", "compassion", "inner steadiness"],
    reversedMeanings: ["self-doubt", "reactivity", "fatigue", "unprocessed fear"]
  },
  {
    id: "the_hermit",
    name: "The Hermit",
    arcana: "Major Arcana",
    uprightMeanings: ["reflection", "solitude", "discernment", "inner guidance"],
    reversedMeanings: ["isolation", "avoidance", "overthinking", "withdrawal"]
  },
  {
    id: "wheel_of_fortune",
    name: "Wheel of Fortune",
    arcana: "Major Arcana",
    uprightMeanings: ["change", "cycles", "timing", "turning point"],
    reversedMeanings: ["resistance", "setback", "pattern repetition", "instability"]
  },
  {
    id: "justice",
    name: "Justice",
    arcana: "Major Arcana",
    uprightMeanings: ["truth", "accountability", "fairness", "clear consequences"],
    reversedMeanings: ["bias", "avoidance", "unfairness", "unclear facts"]
  },
  {
    id: "the_hanged_man",
    name: "The Hanged Man",
    arcana: "Major Arcana",
    uprightMeanings: ["surrender", "new perspective", "pause", "release"],
    reversedMeanings: ["stagnation", "martyrdom", "delay", "resisting insight"]
  },
  {
    id: "death",
    name: "Death",
    arcana: "Major Arcana",
    uprightMeanings: ["ending", "transition", "renewal", "letting go"],
    reversedMeanings: ["clinging", "fear of change", "unfinished closure", "stasis"]
  },
  {
    id: "temperance",
    name: "Temperance",
    arcana: "Major Arcana",
    uprightMeanings: ["balance", "integration", "moderation", "healing rhythm"],
    reversedMeanings: ["excess", "impatience", "imbalance", "disharmony"]
  },
  {
    id: "the_devil",
    name: "The Devil",
    arcana: "Major Arcana",
    uprightMeanings: ["attachment", "temptation", "shadow patterns", "material focus"],
    reversedMeanings: ["release", "reclaiming power", "breaking patterns", "awareness"]
  },
  {
    id: "the_tower",
    name: "The Tower",
    arcana: "Major Arcana",
    uprightMeanings: ["disruption", "revelation", "breakthrough", "false structure falling"],
    reversedMeanings: ["avoided change", "aftershock", "fear of upheaval", "slow rebuild"]
  },
  {
    id: "the_star",
    name: "The Star",
    arcana: "Major Arcana",
    uprightMeanings: ["hope", "renewal", "inspiration", "gentle trust"],
    reversedMeanings: ["discouragement", "dimmed faith", "disconnect", "needing rest"]
  },
  {
    id: "the_moon",
    name: "The Moon",
    arcana: "Major Arcana",
    uprightMeanings: ["uncertainty", "dreams", "intuition", "hidden feelings"],
    reversedMeanings: ["confusion lifting", "anxiety", "misread signals", "avoidance"]
  },
  {
    id: "the_sun",
    name: "The Sun",
    arcana: "Major Arcana",
    uprightMeanings: ["clarity", "vitality", "joy", "confidence"],
    reversedMeanings: ["muted joy", "overconfidence", "temporary cloudiness", "burnout"]
  },
  {
    id: "judgement",
    name: "Judgement",
    arcana: "Major Arcana",
    uprightMeanings: ["awakening", "reckoning", "calling", "self-review"],
    reversedMeanings: ["self-criticism", "avoidance", "doubt", "unfinished lesson"]
  },
  {
    id: "the_world",
    name: "The World",
    arcana: "Major Arcana",
    uprightMeanings: ["completion", "integration", "fulfillment", "arrival"],
    reversedMeanings: ["loose ends", "delayed closure", "unfinished business", "almost there"]
  }
];

Page({
  data: {
    question: "",
    spreads,
    selectedSpreadId: "threeCard",
    selectedSpread: spreads[1],
    drawnCards: [],
    interpretation: null,
    oauthSession: null,
    oauthStatus: cloudAIEnabled ? "CloudBase Hunyuan ready" : "Not connected",
    backendStatus: formatBackendStatus(),
    buildLabel: "0.5.9 faces",
    isConnecting: false,
    isInterpreting: false,
    errorMessage: ""
  },

  onLoad() {
    this.refreshOAuthSession();
  },

  onQuestionInput(event) {
    this.setData({
      question: event.detail.value
    });
  },

  selectSpread(event) {
    const spreadId = event.currentTarget.dataset.spreadId;
    const selectedSpread = spreads.find((spread) => spread.id === spreadId) || spreads[1];

    this.setData({
      selectedSpreadId: spreadId,
      selectedSpread,
      drawnCards: [],
      interpretation: null,
      errorMessage: ""
    });
  },

  drawCards() {
    const drawnCards = drawCards(this.data.selectedSpread);

    this.setData({
      drawnCards,
      interpretation: null,
      errorMessage: ""
    });
  },

  interpretReading() {
    if (!this.data.drawnCards.length) {
      this.setData({
        errorMessage: "Draw cards first."
      });
      return;
    }

    const fallbackReading = createFallbackReading({
      question: this.data.question,
      spread: this.data.selectedSpread,
      drawnCards: this.data.drawnCards,
      sourceLabel: cloudAIEnabled
        ? appConfig.cloudAI.sourceLabel
        : this.data.oauthSession
          ? this.data.oauthSession.label
          : "Local Demo"
    });
    const readingRequest = createReadingRequest({
      question: this.data.question,
      spread: this.data.selectedSpread,
      drawnCards: this.data.drawnCards
    });

    if (!cloudAIEnabled && !canUseBackend(this.data.oauthSession)) {
      this.setData({
        interpretation: normalizeReading(fallbackReading),
        errorMessage: hasUsableOAuth(this.data.oauthSession)
          ? ""
          : "CloudBase AI is not configured. Connect the fallback backend or use a structured demo reading for now."
      });
      return;
    }

    this.setData({
      isInterpreting: true,
      errorMessage: ""
    });

    requestReadingFromBestProvider({
      oauthSession: this.data.oauthSession,
      readingRequest,
      onRetry: () => {
        this.setData({
          errorMessage: "CloudBase AI did not complete; trying the HTTPS fallback."
        });
      },
      onWaiting: (message) => {
        this.setData({
          errorMessage: message || "Waiting for the AI reading."
        });
      }
    })
      .then((result) => {
        this.setData({
          interpretation: normalizeReading(result.reading, fallbackReading),
          errorMessage: result.warning || ""
        });
      })
      .catch((error) => {
        this.setData({
          interpretation: normalizeReading(fallbackReading),
          errorMessage: `${formatProviderError(error)} Showing structured fallback.`
        });
      })
      .finally(() => {
        this.setData({
          isInterpreting: false
        });
      });
  },

  connectChatGPT() {
    this.setData({
      isConnecting: true,
      errorMessage: ""
    });

    connectChatGPT()
      .then((session) => {
        this.setData({
          oauthSession: session,
          oauthStatus: formatOAuthStatus(session),
          errorMessage: session.mode === "demo"
            ? "Prototype backend connected. Add a reading endpoint to call OpenAI server-side."
            : session.openaiConfigured === false
              ? "Fallback backend connected, but its model key is not configured yet."
            : ""
        });
      })
      .catch((error) => {
        this.setData({
          errorMessage: error.message || "Unable to connect the AI reading backend."
        });
      })
      .finally(() => {
        this.setData({
          isConnecting: false
        });
      });
  },

  disconnectChatGPT() {
    clearOAuthSession();
    this.refreshOAuthSession();
  },

  refreshOAuthSession() {
    const oauthSession = loadOAuthSession();

    this.setData({
      oauthSession,
      oauthStatus: formatOAuthStatus(oauthSession)
    });
  }
});

function requestReadingFromBestProvider(options) {
  if (cloudAIEnabled) {
    if (typeof options.onWaiting === "function") {
      options.onWaiting("Waiting for CloudBase Hunyuan.");
    }

    return createCloudBaseReading({
      cloudAIConfig: appConfig.cloudAI,
      readingRequest: options.readingRequest
    })
      .then((reading) => ({
        reading
      }))
      .catch((error) => {
        if (!canUseBackend(options.oauthSession)) {
          throw error;
        }

        if (typeof options.onRetry === "function") {
          options.onRetry(error);
        }

        return requestBackendReading(options);
      });
  }

  return requestBackendReading(options);
}

function requestBackendReading(options) {
  const requestId = createRequestId();
  const oauthSession = options.oauthSession;

  if (typeof options.onWaiting === "function") {
    options.onWaiting("Waiting for the HTTPS fallback reading.");
  }

  return requestReadingWithPolling({
    url: appConfig.oauth.readingEndpoint,
    startUrl: createAsyncReadingUrl(appConfig.oauth.readingEndpoint),
    statusUrl: createReadingStatusUrl(appConfig.oauth.readingEndpoint, requestId),
    header: {
      Authorization: `${oauthSession.tokenType || "Bearer"} ${oauthSession.accessToken}`,
      "Content-Type": "application/json",
      "X-Request-Id": requestId
    },
    data: {
      request: options.readingRequest,
      responseFormat: readingJsonSchema()
    },
    onRetry: () => {
      if (typeof options.onWaiting === "function") {
        options.onWaiting("The fallback connection closed; starting the wait again.");
      }
    },
    onWaiting: options.onWaiting
  }).then((response) => {
    const data = response.data || {};

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(formatReadingError(data.error));
    }

    return {
      reading: data.reading || data,
      warning: data.backend && data.backend.openaiConfigured === false
        ? "Fallback backend connected, but model generation is not configured."
        : ""
    };
  });
}

function canUseBackend(oauthSession) {
  return Boolean(appConfig.oauth.readingEndpoint && hasUsableOAuth(oauthSession));
}

function requestReadingWithPolling(options) {
  const startedAt = Date.now();

  return startReadingRequest(options, READING_START_ATTEMPTS).then((response) => {
    if (response.statusCode === 202) {
      if (typeof options.onWaiting === "function") {
        options.onWaiting();
      }

      return pollReadingStatus(options, startedAt, getRetryDelay(response), READING_START_RECOVERY_ATTEMPTS);
    }

    return response;
  }).catch(() => {
    if (typeof options.onWaiting === "function") {
      options.onWaiting();
    }

    return pollReadingStatus(options, startedAt, READING_POLL_DELAY_MS, READING_START_RECOVERY_ATTEMPTS);
  });
}

function startReadingRequest(options, attemptsRemaining) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: options.startUrl || options.url,
      method: "POST",
      timeout: READING_REQUEST_TIMEOUT_MS,
      header: options.header,
      data: options.data,
      success: resolve,
      fail: (error) => {
        if (attemptsRemaining > 1) {
          if (typeof options.onRetry === "function") {
            options.onRetry(error);
          }

          setTimeout(() => {
            startReadingRequest(options, attemptsRemaining - 1).then(resolve).catch(reject);
          }, READING_RETRY_DELAY_MS);
          return;
        }

        reject(error);
      }
    });
  });
}

function pollReadingStatus(options, startedAt, delayMs, recoveryStartsRemaining) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (Date.now() - startedAt > READING_POLL_TIMEOUT_MS) {
        reject({
          errMsg: "timed out waiting for reading response"
        });
        return;
      }

      wx.request({
        url: options.statusUrl,
        method: "GET",
        timeout: READING_REQUEST_TIMEOUT_MS,
        header: {
          Authorization: options.header.Authorization
        },
        success: (response) => {
          if (response.statusCode === 202) {
            if (typeof options.onWaiting === "function") {
              options.onWaiting();
            }

            pollReadingStatus(options, startedAt, getRetryDelay(response), recoveryStartsRemaining).then(resolve).catch(reject);
            return;
          }

          if (response.statusCode === 404 && recoveryStartsRemaining > 0) {
            if (typeof options.onRetry === "function") {
              options.onRetry(response);
            }

            startReadingRequest(options, 1)
              .then((startResponse) => {
                if (startResponse.statusCode !== 202) {
                  resolve(startResponse);
                  return;
                }

                pollReadingStatus(options, startedAt, getRetryDelay(startResponse), recoveryStartsRemaining - 1)
                  .then(resolve)
                  .catch(reject);
              })
              .catch(() => {
                pollReadingStatus(options, startedAt, READING_POLL_DELAY_MS, recoveryStartsRemaining - 1)
                  .then(resolve)
                  .catch(reject);
              });
            return;
          }

          resolve(response);
        },
        fail: () => {
          pollReadingStatus(options, startedAt, READING_POLL_DELAY_MS, recoveryStartsRemaining).then(resolve).catch(reject);
        }
      });
    }, delayMs);
  });
}

function getRetryDelay(response) {
  const retryAfterMs = response && response.data && Number(response.data.retryAfterMs);

  return Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : READING_POLL_DELAY_MS;
}

function createAsyncReadingUrl(readingEndpoint) {
  const separator = readingEndpoint.indexOf("?") === -1 ? "?" : "&";

  return `${readingEndpoint}${separator}async=1`;
}

function createReadingStatusUrl(readingEndpoint, requestId) {
  return `${readingEndpoint.replace(/\/readings$/, "/readings/status")}?requestId=${encodeURIComponent(requestId)}`;
}

function createRequestId() {
  return `reading-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatOAuthStatus(session) {
  if (cloudAIEnabled) {
    return canUseBackend(session) ? "CloudBase Hunyuan ready · fallback connected" : "CloudBase Hunyuan ready";
  }

  if (!session) {
    return "Not connected";
  }

  if (session.openaiConfigured === false) {
    return `${session.label} · AI key missing`;
  }

  return session.label;
}

function formatBackendStatus() {
  if (cloudAIEnabled) {
    return `${appConfig.cloudAI.model} · ${appConfig.cloudAI.envId}`;
  }

  return appConfig.oauth.readingEndpoint.replace(/\/readings$/, "");
}

function formatReadingError(errorMessage) {
  if (errorMessage && errorMessage.indexOf("bearer token") !== -1) {
    return "Backend connected, but the AI provider token is not configured on the server.";
  }

  return errorMessage || "AI reading failed.";
}

function formatProviderError(error) {
  const message = error && (error.message || error.errMsg);

  if (message) {
    return `Unable to generate an AI reading: ${message}.`;
  }

  return "Unable to generate an AI reading.";
}

function drawCards(spread) {
  const deck = shuffle(tarotDeck.slice());

  return spread.positions.map((position, index) => {
    const card = deck[index];
    const orientation = Math.random() >= 0.5 ? "upright" : "reversed";
    const keywords = orientation === "upright" ? card.uprightMeanings : card.reversedMeanings;

    return {
      id: `${card.id}-${position}`,
      card: Object.assign({}, card, {
        imageSrc: cardFaceMap[card.id] || ""
      }),
      position,
      orientation,
      orientationLabel: formatOrientation(orientation),
      keywords
    };
  });
}

function formatOrientation(orientation) {
  return orientation === "reversed" ? "逆位" : "正位";
}

function shuffle(cards) {
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
  }

  return cards;
}
