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
const RAHDUE_SPREAD_ID = "rahdueWheel";
const RAHDUE_MANUAL_DRAW_MODE = "fullDeckManual";
const rahdueDefaultQuestions = {
  zh: "我想透过拉杜之轮理解前世洞见、业力模式与此刻可触及的内在智慧。",
  en: "What past-life insight, karmic pattern, and inner wisdom can Rahdue's Wheel reflect for me now?"
};

const rahdueSectionTemplates = [
  {
    id: "innerWheel",
    title: {
      zh: "内轮",
      en: "Inner Wheel"
    },
    count: 12
  },
  {
    id: "solidifier1",
    title: {
      zh: "第一固化牌",
      en: "Solidifier 1"
    },
    count: 1
  },
  {
    id: "centerWheel",
    title: {
      zh: "中心轮",
      en: "Center Wheel"
    },
    count: 12
  },
  {
    id: "solidifier2",
    title: {
      zh: "第二固化牌",
      en: "Solidifier 2"
    },
    count: 1
  },
  {
    id: "outerWheel",
    title: {
      zh: "外轮",
      en: "Outer Wheel"
    },
    count: 12
  },
  {
    id: "solidifier3",
    title: {
      zh: "第三固化牌",
      en: "Solidifier 3"
    },
    count: 1
  },
  {
    id: "dagimBlock",
    title: {
      zh: "Dagim 区块",
      en: "Dagim Block"
    },
    count: 9
  },
  {
    id: "solidifier4",
    title: {
      zh: "第四固化牌",
      en: "Solidifier 4"
    },
    count: 1
  },
  {
    id: "talehPillar",
    title: {
      zh: "Taleh 支柱",
      en: "Taleh Pillar"
    },
    count: 9
  },
  {
    id: "solidifier5",
    title: {
      zh: "第五固化牌",
      en: "Solidifier 5"
    },
    count: 1
  },
  {
    id: "shorPillar",
    title: {
      zh: "Shor 支柱",
      en: "Shor Pillar"
    },
    count: 9
  },
  {
    id: "solidifier6",
    title: {
      zh: "第六固化牌",
      en: "Solidifier 6"
    },
    count: 1
  },
  {
    id: "malkuthBlock",
    title: {
      zh: "Malkuth 区块",
      en: "Malkuth Block"
    },
    count: 9
  }
];

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
  },
  {
    id: RAHDUE_SPREAD_ID,
    title: {
      zh: "拉杜之轮",
      en: "Rahdue’s Wheel"
    },
    positions: {
      zh: createRahduePositions("zh"),
      en: createRahduePositions("en")
    },
    sections: {
      zh: createRahdueSections("zh"),
      en: createRahdueSections("en")
    },
    insight: "- Highly experimental full-deck wheel",
    guide: {
      zh: "适合问：需要用完整牌组象征性观察前世洞见、业力模式、内在智慧或复杂人生结构时。",
      en: "Ask when you want a full-deck symbolic view of past-life insight, karmic patterns, inner wisdom, or complex life structure."
    },
    warning: {
      zh: "高度实验 / 不稳定",
      en: "Highly experimental / unstable"
    },
    experimental: true,
    unstable: true,
    drawMode: "fullDeckAuto"
  }
];

function createSpreads(language) {
  const languageCode = normalizeLanguageCode(language);

  return spreadTemplates.map((spread) => normalizeSpreadTemplate(spread, languageCode));
}

function createAdvancedSpreadOptions(language) {
  return createSpreads(language).map((spread) => normalizeAdvancedSpreadOption(spread));
}

function createReaderOptions() {
  return readerProfileOptions.map((reader) => ({
    id: reader.id,
    title: reader.title
  }));
}

function getRahdueDefaultQuestion(language) {
  const languageCode = normalizeLanguageCode(language);

  return rahdueDefaultQuestions[languageCode] || rahdueDefaultQuestions.zh;
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
        readerId: advancedSelection.readerId,
        rahdueHandDrawn: advancedSelection.rahdueHandDrawn
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
    readerId: SIMPLE_READER_ID,
    rahdueHandDrawn: false
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
      readerId,
      rahdueHandDrawn: spreadId === RAHDUE_SPREAD_ID && Boolean(selection.rahdueHandDrawn)
    };
  } catch (error) {
    return fallback;
  }
}

function saveAdvancedReadingSelection(selection) {
  wx.setStorageSync(READING_MODE_STORAGE_KEY, "advanced");
  wx.setStorageSync(ADVANCED_READING_SELECTION_STORAGE_KEY, {
    spreadId: selection.spreadId,
    readerId: selection.readerId,
    rahdueHandDrawn: selection.spreadId === RAHDUE_SPREAD_ID && Boolean(selection.rahdueHandDrawn)
  });
}

function saveSimpleReadingMode() {
  wx.setStorageSync(READING_MODE_STORAGE_KEY, "simple");
  wx.setStorageSync(ADVANCED_READING_SELECTION_STORAGE_KEY, {
    spreadId: SIMPLE_SPREAD_ID,
    readerId: SIMPLE_READER_ID,
    rahdueHandDrawn: false
  });
}

function createSimpleModeSelection() {
  return {
    mode: "simple",
    spreadId: SIMPLE_SPREAD_ID,
    readerId: SIMPLE_READER_ID,
    rahdueHandDrawn: false
  };
}

function normalizeSpreadTemplate(spread, languageCode) {
  const normalizedSpread = {
    id: spread.id,
    title: spread.title[languageCode] || spread.title.zh,
    positions: spread.positions[languageCode] || spread.positions.zh,
    insight: spread.insight
  };

  if (spread.sections) {
    normalizedSpread.sections = spread.sections[languageCode] || spread.sections.zh;
  }

  if (spread.guide) {
    normalizedSpread.guide = spread.guide[languageCode] || spread.guide.zh;
  }

  if (spread.warning) {
    normalizedSpread.warning = spread.warning[languageCode] || spread.warning.zh;
  }

  if (spread.experimental) {
    normalizedSpread.experimental = true;
  }

  if (spread.unstable) {
    normalizedSpread.unstable = true;
  }

  if (spread.drawMode) {
    normalizedSpread.drawMode = spread.drawMode;
  }

  return normalizedSpread;
}

function normalizeAdvancedSpreadOption(spread) {
  return {
    id: spread.id,
    title: spread.title,
    guide: spread.guide,
    warning: spread.warning,
    experimental: spread.experimental,
    unstable: spread.unstable,
    drawMode: spread.drawMode
  };
}

function createRahdueSections(language) {
  const languageCode = normalizeLanguageCode(language);
  let cursor = 1;

  return rahdueSectionTemplates.map((section) => {
    const start = cursor;
    const end = cursor + section.count - 1;

    cursor = end + 1;

    return {
      id: section.id,
      title: section.title[languageCode] || section.title.zh,
      start,
      end,
      count: section.count
    };
  });
}

function createRahduePositions(language) {
  return createRahdueSections(language).reduce((positions, section) => {
    for (let positionNumber = section.start; positionNumber <= section.end; positionNumber += 1) {
      positions.push(`${section.title} ${String(positionNumber).padStart(2, "0")}`);
    }

    return positions;
  }, []);
}

module.exports = {
  RAHDUE_MANUAL_DRAW_MODE,
  RAHDUE_SPREAD_ID,
  SIMPLE_READER_ID,
  SIMPLE_SPREAD_ID,
  createAdvancedSpreadOptions,
  createRahdueSections,
  createReaderOptions,
  createSpreads,
  getRahdueDefaultQuestion,
  getSpreadById,
  getStoredReadingMode,
  loadAdvancedReadingSelection,
  saveAdvancedReadingSelection,
  saveSimpleReadingMode
};
