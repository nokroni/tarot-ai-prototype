const {
  formatOrientationText,
  getLanguageConfig,
  normalizeLanguageCode
} = require("../../services/language");
const { loadLatestReadingResult } = require("../../services/reading-result");

const uiCopy = {
  zh: {
    title: "解读",
    cardsTitle: "抽到的牌",
    overallLabel: "整体讯息",
    actionLabel: "行动提醒",
    questionLabel: "问题",
    returnHome: "回到主页",
    emptyTitle: "还没有解读",
    emptyCopy: "完成抽牌后，解读会在这里出现。"
  },
  en: {
    title: "Reading",
    cardsTitle: "Drawn Cards",
    overallLabel: "Overall message",
    actionLabel: "Action reminder",
    questionLabel: "Question",
    returnHome: "Return Home",
    emptyTitle: "No reading yet",
    emptyCopy: "Finish drawing the spread and the reading will appear here."
  }
};

Page({
  data: {
    ui: uiCopy.zh,
    language: "zh",
    interpretation: null,
    cards: [],
    question: "",
    metadataLine: "",
    notice: "",
    empty: false
  },

  onLoad() {
    this.loadReadingResult();
  },

  onShow() {
    if (!this.data.interpretation) {
      this.loadReadingResult();
    }
  },

  loadReadingResult() {
    const result = loadLatestReadingResult();
    const language = normalizeLanguageCode(result && result.language);
    const interpretation = result && result.interpretation ? result.interpretation : null;

    if (!interpretation) {
      this.setData({
        ui: uiCopy[language],
        language,
        interpretation: null,
        cards: [],
        question: "",
        metadataLine: "",
        notice: "",
        empty: true
      });
      return;
    }

    this.setData({
      ui: uiCopy[language],
      language,
      interpretation,
      cards: createDisplayCards(interpretation.cards, result.drawnCards, language),
      question: result.question || "",
      metadataLine: createMetadataLine(result),
      notice: result.notice || "",
      empty: false
    });
  },

  returnHome() {
    const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];

    if (typeof wx !== "undefined" && pages.length > 1 && wx.navigateBack) {
      wx.navigateBack();
      return;
    }

    if (typeof wx !== "undefined" && wx.redirectTo) {
      wx.redirectTo({
        url: "/pages/index/index"
      });
    }
  }
});

function createDisplayCards(readingCards, drawnCards, language) {
  const cards = Array.isArray(readingCards) ? readingCards : [];
  const drawn = Array.isArray(drawnCards) ? drawnCards : [];

  const languageConfig = getLanguageConfig(language);

  return cards.map((card, index) => {
    const readingCard = card && typeof card === "object" ? card : {};
    const matched = findDrawnCard(card, drawn, index);
    const cardFace = matched.card || {};
    const keywords = Array.isArray(readingCard.keywords) && readingCard.keywords.length
      ? readingCard.keywords
      : Array.isArray(matched.keywords)
        ? matched.keywords
        : [];

    const orientationText = readingCard.orientationText || formatOrientationText(matched.orientation, language);
    const orientation = readingCard.orientation || matched.orientation || "upright";
    const keywordsText = readingCard.keywordsText || keywords.join(languageConfig.keywordJoiner);

    return {
      id: readingCard.id || matched.id || `reading-card-${index}`,
      position: readingCard.position || matched.position || "",
      name: readingCard.name || cardFace.name || "",
      isReversed: orientation === "reversed",
      orientationText,
      keywordsText,
      metaLine: keywordsText ? `${orientationText} · ${keywordsText}` : orientationText,
      interpretation: readingCard.interpretation || "",
      imageSrc: cardFace.imageSrc || matched.imageSrc || ""
    };
  });
}

function findDrawnCard(card, drawnCards, index) {
  if (card && card.id) {
    const matched = drawnCards.find((drawn) => drawn && drawn.id === card.id);

    if (matched) {
      return matched;
    }
  }

  return drawnCards[index] || {};
}

function createMetadataLine(result) {
  const spreadTitle = result.spread && result.spread.title;
  const readerTitle = result.reader && result.reader.title;

  return [spreadTitle, readerTitle].filter(Boolean).join(" · ");
}
