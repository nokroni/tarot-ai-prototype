const {
  formatOrientationText,
  getLanguageConfig,
  normalizeLanguageCode
} = require("../../services/language");
const { RAHDUE_SPREAD_ID } = require("../../services/reading-options");
const { loadLatestReadingResult } = require("../../services/reading-result");

const RAHDUE_CANVAS_ID = "rahdue-wheel-canvas";
const RAHDUE_CANVAS_WIDTH = 686;
const RAHDUE_CANVAS_HEIGHT = 980;
const RAHDUE_CANVAS_CARD_WIDTH = 24;
const RAHDUE_CANVAS_CARD_HEIGHT = 42;

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
    sections: [],
    isRahdueReading: false,
    showActionReminder: true,
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
        sections: [],
        isRahdueReading: false,
        showActionReminder: true,
        question: "",
        metadataLine: "",
        notice: "",
        empty: true
      });
      return;
    }

    const cards = createDisplayCards(interpretation.cards, result.drawnCards, language);
    const isRahdueReading = isRahdueSpread(result.spread);

    this.setData({
      ui: uiCopy[language],
      language,
      interpretation,
      cards,
      sections: createDisplaySections(interpretation.sections, result.spread, cards),
      isRahdueReading,
      showActionReminder: !isRahdueReading,
      question: result.question || "",
      metadataLine: createMetadataLine(result),
      notice: result.notice || "",
      empty: false
    }, () => {
      if (isRahdueReading) {
        drawRahdueWheelCanvas(this, cards);
      }
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

function createDisplaySections(readingSections, spread, cards) {
  const sections = Array.isArray(readingSections) ? readingSections : [];
  const spreadSections = spread && Array.isArray(spread.sections) ? spread.sections : [];

  return spreadSections.map((spreadSection, index) => {
    const readingSection = sections.find((section) => section && section.id === spreadSection.id) || sections[index] || {};

    return {
      id: spreadSection.id,
      title: readingSection.title || spreadSection.title,
      interpretation: readingSection.interpretation || "",
      keyCards: Array.isArray(readingSection.keyCards) ? readingSection.keyCards : [],
      cards: cards.slice(spreadSection.start - 1, spreadSection.end)
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

function isRahdueSpread(spread) {
  return Boolean(spread && spread.id === RAHDUE_SPREAD_ID);
}

function drawRahdueWheelCanvas(page, cards) {
  if (typeof wx === "undefined" || !wx.createCanvasContext || !Array.isArray(cards) || cards.length < 78) {
    return;
  }

  drawRahdueWheelCanvasWithImagePaths(page, cards, {});

  if (!wx.getImageInfo || typeof Promise === "undefined") {
    return;
  }

  resolveRahdueCanvasImagePaths(cards).then((imagePaths) => {
    drawRahdueWheelCanvasWithImagePaths(page, cards, imagePaths);
  }).catch(() => {
    drawRahdueWheelCanvasWithImagePaths(page, cards, {});
  });
}

function drawRahdueWheelCanvasWithImagePaths(page, cards, imagePaths) {
  const ctx = wx.createCanvasContext(RAHDUE_CANVAS_ID, page);

  if (!ctx) {
    return;
  }

  const layout = createRahdueCanvasLayout(cards);

  ctx.clearRect(0, 0, RAHDUE_CANVAS_WIDTH, RAHDUE_CANVAS_HEIGHT);
  ctx.setFillStyle("#f8f1fb");
  ctx.fillRect(0, 0, RAHDUE_CANVAS_WIDTH, RAHDUE_CANVAS_HEIGHT);
  ctx.setStrokeStyle("rgba(91, 63, 163, 0.16)");
  ctx.setLineWidth(2);
  drawRahdueGuideGeometry(ctx);
  layout.forEach((slot) => drawRahdueCanvasCard(ctx, slot, imagePaths));
  ctx.draw(false);
}

function resolveRahdueCanvasImagePaths(cards) {
  return Promise.all(cards.map((card) => resolveRahdueCanvasImagePath(card))).then((entries) => (
    entries.reduce((paths, entry) => {
      if (entry && entry.id && entry.path) {
        paths[entry.id] = entry.path;
      }

      return paths;
    }, {})
  ));
}

function resolveRahdueCanvasImagePath(card) {
  return new Promise((resolve) => {
    if (!card || !card.id || !card.imageSrc) {
      resolve(null);
      return;
    }

    wx.getImageInfo({
      src: card.imageSrc,
      success: (result) => {
        resolve({
          id: card.id,
          path: result.path || card.imageSrc
        });
      },
      fail: () => {
        resolve({
          id: card.id,
          path: card.imageSrc
        });
      }
    });
  });
}

function drawRahdueGuideGeometry(ctx) {
  const centerX = RAHDUE_CANVAS_WIDTH / 2;
  const centerY = 274;

  [92, 150, 208].forEach((radius) => {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
  });

  ctx.setFillStyle("rgba(91, 63, 163, 0.72)");
  ctx.setFontSize(18);
  ctx.fillText("Inner / Center / Outer", centerX - 86, 36);
  ctx.fillText("Shor", 82, 430);
  ctx.fillText("Dagim", centerX - 28, 474);
  ctx.fillText("Taleh", 548, 430);
  ctx.fillText("Malkuth", centerX - 38, 752);
}

function createRahdueCanvasLayout(cards) {
  const layout = [];
  const centerX = RAHDUE_CANVAS_WIDTH / 2;
  const centerY = 274;

  appendWheelRing(layout, cards, 1, 12, centerX, centerY, 92);
  appendSolidifier(layout, cards, 13, centerX + 246, centerY - 62);
  appendWheelRing(layout, cards, 14, 25, centerX, centerY, 150);
  appendSolidifier(layout, cards, 26, centerX + 270, centerY - 21);
  appendWheelRing(layout, cards, 27, 38, centerX, centerY, 208);
  appendSolidifier(layout, cards, 39, centerX + 246, centerY + 20);
  appendCardGrid(layout, cards, 40, 48, centerX - 44, 498, 3, 30, 50);
  appendSolidifier(layout, cards, 49, centerX + 64, 548);
  appendCardColumn(layout, cards, 50, 58, 552, 456, 48);
  appendSolidifier(layout, cards, 59, 594, 628);
  appendCardColumn(layout, cards, 60, 68, 110, 456, 48);
  appendSolidifier(layout, cards, 69, 68, 628);
  appendCardGrid(layout, cards, 70, 78, centerX - 44, 780, 3, 30, 50);

  return layout;
}

function appendWheelRing(layout, cards, start, end, centerX, centerY, radius) {
  const count = end - start + 1;

  for (let position = start; position <= end; position += 1) {
    const offset = position - start;
    const angle = (-Math.PI / 2) + (offset / count) * Math.PI * 2;
    const x = centerX + Math.cos(angle) * radius - RAHDUE_CANVAS_CARD_WIDTH / 2;
    const y = centerY + Math.sin(angle) * radius - RAHDUE_CANVAS_CARD_HEIGHT / 2;

    appendCanvasCard(layout, cards, position, x, y, angle + Math.PI / 2);
  }
}

function appendCardGrid(layout, cards, start, end, originX, originY, columns, gapX, gapY) {
  for (let position = start; position <= end; position += 1) {
    const offset = position - start;
    const column = offset % columns;
    const row = Math.floor(offset / columns);

    appendCanvasCard(
      layout,
      cards,
      position,
      originX + column * gapX,
      originY + row * gapY,
      0
    );
  }
}

function appendCardColumn(layout, cards, start, end, originX, originY, gapY) {
  for (let position = start; position <= end; position += 1) {
    appendCanvasCard(layout, cards, position, originX, originY + (position - start) * gapY, 0);
  }
}

function appendSolidifier(layout, cards, position, x, y) {
  appendCanvasCard(layout, cards, position, x, y, 0, true);
}

function appendCanvasCard(layout, cards, position, x, y, rotation, solidifier) {
  const card = cards[position - 1];

  if (!card) {
    return;
  }

  layout.push({
    card,
    position,
    x,
    y,
    rotation: rotation || 0,
    solidifier: Boolean(solidifier)
  });
}

function drawRahdueCanvasCard(ctx, slot, imagePaths) {
  const rotation = slot.rotation + (slot.card.isReversed ? Math.PI : 0);
  const centerX = slot.x + RAHDUE_CANVAS_CARD_WIDTH / 2;
  const centerY = slot.y + RAHDUE_CANVAS_CARD_HEIGHT / 2;
  const imageSrc = imagePaths && imagePaths[slot.card.id] ? imagePaths[slot.card.id] : slot.card.imageSrc;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(rotation);
  ctx.setFillStyle(slot.solidifier ? "#fff3d5" : "#fffaf0");
  ctx.setStrokeStyle(slot.solidifier ? "rgba(151, 73, 56, 0.62)" : "rgba(91, 63, 163, 0.28)");
  ctx.setLineWidth(slot.solidifier ? 2 : 1);
  ctx.fillRect(-RAHDUE_CANVAS_CARD_WIDTH / 2, -RAHDUE_CANVAS_CARD_HEIGHT / 2, RAHDUE_CANVAS_CARD_WIDTH, RAHDUE_CANVAS_CARD_HEIGHT);

  if (imageSrc) {
    ctx.drawImage(imageSrc, -RAHDUE_CANVAS_CARD_WIDTH / 2, -RAHDUE_CANVAS_CARD_HEIGHT / 2, RAHDUE_CANVAS_CARD_WIDTH, RAHDUE_CANVAS_CARD_HEIGHT);
  }

  ctx.strokeRect(-RAHDUE_CANVAS_CARD_WIDTH / 2, -RAHDUE_CANVAS_CARD_HEIGHT / 2, RAHDUE_CANVAS_CARD_WIDTH, RAHDUE_CANVAS_CARD_HEIGHT);
  ctx.restore();
}
