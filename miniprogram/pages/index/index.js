const appConfig = require("../../config");
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

const READING_REQUEST_ATTEMPTS = 2;
const READING_REQUEST_TIMEOUT_MS = 120000;
const READING_RETRY_DELAY_MS = 900;

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
    oauthStatus: "Not connected",
    backendStatus: appConfig.oauth.readingEndpoint.replace(/\/readings$/, ""),
    buildLabel: "0.5.5 retry",
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
      sourceLabel: this.data.oauthSession ? this.data.oauthSession.label : "Local Demo"
    });

    if (!hasUsableOAuth(this.data.oauthSession) || !appConfig.oauth.readingEndpoint) {
      this.setData({
        interpretation: normalizeReading(fallbackReading),
        errorMessage: hasUsableOAuth(this.data.oauthSession)
          ? ""
          : "Connect the AI backend to use server-side generation. Showing a structured demo reading for now."
      });
      return;
    }

    this.setData({
      isInterpreting: true,
      errorMessage: ""
    });

    requestReadingWithRetry({
      url: appConfig.oauth.readingEndpoint,
      header: {
        Authorization: `${this.data.oauthSession.tokenType || "Bearer"} ${this.data.oauthSession.accessToken}`,
        "Content-Type": "application/json",
        "X-Request-Id": createRequestId()
      },
      data: {
        request: createReadingRequest({
          question: this.data.question,
          spread: this.data.selectedSpread,
          drawnCards: this.data.drawnCards
        }),
        responseFormat: readingJsonSchema()
      },
      onRetry: () => {
        this.setData({
          errorMessage: "The reading connection closed; retrying once."
        });
      }
    })
      .then((response) => {
        const data = response.data || {};
        const reading = data.reading || data;

        if (response.statusCode < 200 || response.statusCode >= 300) {
          this.setData({
            interpretation: normalizeReading(fallbackReading),
            errorMessage: formatReadingError(data.error)
          });
          return;
        }

        this.setData({
          interpretation: normalizeReading(reading, fallbackReading),
          errorMessage: data.backend && data.backend.openaiConfigured === false
            ? "Backend connected, but model generation is not configured. Showing structured fallback."
            : ""
        });
      })
      .catch((error) => {
        this.setData({
          interpretation: normalizeReading(fallbackReading),
          errorMessage: `Unable to reach reading backend${error && error.errMsg ? `: ${error.errMsg}` : ""}. Showing structured fallback.`
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
              ? "Backend connected, but OpenAI API key is not configured yet. Interpret will show a structured fallback."
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

function requestReadingWithRetry(options) {
  return new Promise((resolve, reject) => {
    runReadingRequest(options, READING_REQUEST_ATTEMPTS, resolve, reject);
  });
}

function runReadingRequest(options, attemptsRemaining, resolve, reject) {
  wx.request({
    url: options.url,
    method: "POST",
    timeout: READING_REQUEST_TIMEOUT_MS,
    header: options.header,
    data: options.data,
    success: (response) => {
      resolve(response);
    },
    fail: (error) => {
      if (attemptsRemaining > 1) {
        if (typeof options.onRetry === "function") {
          options.onRetry(error);
        }

        setTimeout(() => {
          runReadingRequest(options, attemptsRemaining - 1, resolve, reject);
        }, READING_RETRY_DELAY_MS);
        return;
      }

      reject(error);
    }
  });
}

function createRequestId() {
  return `reading-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatOAuthStatus(session) {
  if (!session) {
    return "Not connected";
  }

  if (session.openaiConfigured === false) {
    return `${session.label} · AI key missing`;
  }

  return session.label;
}

function formatReadingError(errorMessage) {
  if (errorMessage && errorMessage.indexOf("bearer token") !== -1) {
    return "Backend connected, but the AI provider token is not configured on the server. Showing structured fallback.";
  }

  return errorMessage || "AI reading failed. Showing structured fallback.";
}

function drawCards(spread) {
  const deck = shuffle(tarotDeck.slice());

  return spread.positions.map((position, index) => {
    const card = deck[index];
    const orientation = Math.random() >= 0.5 ? "upright" : "reversed";
    const keywords = orientation === "upright" ? card.uprightMeanings : card.reversedMeanings;

    return {
      id: `${card.id}-${position}`,
      card,
      position,
      orientation,
      keywords
    };
  });
}

function shuffle(cards) {
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
  }

  return cards;
}
