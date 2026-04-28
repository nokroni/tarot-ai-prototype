const {
  DEFAULT_READER_PROFILE_ID,
  readerProfileOptions
} = require("./reader-profiles");
const { normalizeLanguageCode } = require("./language");

const READING_MODE_STORAGE_KEY = "tarot_reading_mode";
const ADVANCED_READING_SELECTION_STORAGE_KEY = "tarot_advanced_reading_selection";
const SIMPLE_SPREAD_ID = "oneCard";
const SIMPLE_READER_ID = DEFAULT_READER_PROFILE_ID;
const DEFAULT_ADVANCED_SPREAD_ID = "threeCard";

const spreadTemplates = [
  {
    id: "oneCard",
    title: {
      zh: "单张牌",
      en: "Single Card"
    },
    positions: {
      zh: ["指引"],
      en: ["Guidance"]
    },
    insight: "- Light another candle"
  },
  {
    id: "threeCard",
    title: {
      zh: "三张牌",
      en: "Three Cards"
    },
    positions: {
      zh: ["现状", "挑战", "建议"],
      en: ["Situation", "Challenge", "Advice"]
    },
    insight: "- Everything in its right place"
  },
  {
    id: "timeFlow",
    title: {
      zh: "时间流",
      en: "Time Flow"
    },
    positions: {
      zh: ["过去", "现在", "未来"],
      en: ["Past", "Now", "Future"]
    },
    insight: "- Yesterday I woke up sucking a lemon"
  },
  {
    id: "decisionPair",
    title: {
      zh: "决策双牌",
      en: "Decision Pair"
    },
    positions: {
      zh: ["方案 A", "方案 B"],
      en: ["Plan A", "Plan B"]
    },
    insight: "- There are two colours in my head"
  }
];

function createSpreads(language) {
  const languageCode = normalizeLanguageCode(language);

  return spreadTemplates.map((spread) => ({
    id: spread.id,
    title: spread.title[languageCode] || spread.title.zh,
    positions: spread.positions[languageCode] || spread.positions.zh,
    insight: spread.insight
  }));
}

function createAdvancedSpreadOptions(language) {
  return createSpreads(language).map((spread) => ({
    id: spread.id,
    title: spread.title
  }));
}

function createReaderOptions() {
  return readerProfileOptions.map((reader) => ({
    id: reader.id,
    title: reader.title
  }));
}

function getSpreadById(spreads, spreadId) {
  return spreads.find((spread) => spread.id === spreadId) || spreads[0];
}

function getStoredReadingMode() {
  if (typeof wx === "undefined" || !wx.getStorageSync) {
    return createSimpleModeSelection();
  }

  try {
    const mode = wx.getStorageSync(READING_MODE_STORAGE_KEY);
    const advancedSelection = loadAdvancedReadingSelection();

    if (mode === "advanced") {
      return {
        mode: "advanced",
        spreadId: advancedSelection.spreadId,
        readerId: advancedSelection.readerId
      };
    }
  } catch (error) {
    // Reading mode storage is optional; the home page has a stable default.
  }

  return createSimpleModeSelection();
}

function loadAdvancedReadingSelection() {
  const fallback = {
    spreadId: DEFAULT_ADVANCED_SPREAD_ID,
    readerId: SIMPLE_READER_ID
  };

  if (typeof wx === "undefined" || !wx.getStorageSync) {
    return fallback;
  }

  try {
    const selection = wx.getStorageSync(ADVANCED_READING_SELECTION_STORAGE_KEY) || {};
    const spreadId = spreadTemplates.some((spread) => spread.id === selection.spreadId)
      ? selection.spreadId
      : fallback.spreadId;
    const readerId = readerProfileOptions.some((reader) => reader.id === selection.readerId)
      ? selection.readerId
      : fallback.readerId;

    return {
      spreadId,
      readerId
    };
  } catch (error) {
    return fallback;
  }
}

function saveAdvancedReadingSelection(selection) {
  wx.setStorageSync(READING_MODE_STORAGE_KEY, "advanced");
  wx.setStorageSync(ADVANCED_READING_SELECTION_STORAGE_KEY, {
    spreadId: selection.spreadId,
    readerId: selection.readerId
  });
}

function saveSimpleReadingMode() {
  wx.setStorageSync(READING_MODE_STORAGE_KEY, "simple");
  wx.setStorageSync(ADVANCED_READING_SELECTION_STORAGE_KEY, {
    spreadId: SIMPLE_SPREAD_ID,
    readerId: SIMPLE_READER_ID
  });
}

function createSimpleModeSelection() {
  return {
    mode: "simple",
    spreadId: SIMPLE_SPREAD_ID,
    readerId: SIMPLE_READER_ID
  };
}

module.exports = {
  SIMPLE_READER_ID,
  SIMPLE_SPREAD_ID,
  createAdvancedSpreadOptions,
  createReaderOptions,
  createSpreads,
  getSpreadById,
  getStoredReadingMode,
  loadAdvancedReadingSelection,
  saveAdvancedReadingSelection,
  saveSimpleReadingMode
};
