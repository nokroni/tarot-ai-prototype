const {
  formatOrientationText,
  getLanguageConfig,
  normalizeLanguageCode
} = require("../../services/language");
const { RAHDUE_SPREAD_ID } = require("../../services/reading-options");
const { loadLatestReadingResult } = require("../../services/reading-result");

const RAHDUE_CANVAS_ID = "rahdue-wheel-canvas";
const RAHDUE_CANVAS_BASE_WIDTH = 650;
const RAHDUE_CANVAS_BASE_HEIGHT = 1040;
const RAHDUE_CANVAS_BASE_CARD_WIDTH = 26;
const RAHDUE_CANVAS_BASE_CARD_HEIGHT = 44;
const RAHDUE_CANVAS_IMAGE_BATCH_SIZE = 6;

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

  getRahdueCanvasMetrics(page).then((metrics) => {
    drawRahdueWheelCanvasWithImagePaths(page, cards, {}, metrics);

    if (typeof Promise === "undefined") {
      return;
    }

    resolveRahdueCanvasImagePaths(cards, (imagePaths) => {
      drawRahdueWheelCanvasWithImagePaths(page, cards, imagePaths, metrics);
    }).then((imagePaths) => {
      drawRahdueWheelCanvasWithImagePaths(page, cards, imagePaths, metrics);
    }).catch(() => {
      drawRahdueWheelCanvasWithImagePaths(page, cards, {}, metrics);
    });
  });
}

function drawRahdueWheelCanvasWithImagePaths(page, cards, imagePaths, metrics) {
  const ctx = wx.createCanvasContext(RAHDUE_CANVAS_ID, page);
  const canvasMetrics = metrics || createFallbackRahdueCanvasMetrics();

  if (!ctx) {
    return;
  }

  const layout = createRahdueCanvasLayout(cards, canvasMetrics);

  ctx.clearRect(0, 0, canvasMetrics.width, canvasMetrics.height);
  ctx.setFillStyle("#f8f1fb");
  ctx.fillRect(0, 0, canvasMetrics.width, canvasMetrics.height);
  ctx.setStrokeStyle("rgba(91, 63, 163, 0.16)");
  ctx.setLineWidth(scaleRahdueMetric(canvasMetrics, 2));
  drawRahdueGuideGeometry(ctx, canvasMetrics);
  layout.forEach((slot) => drawRahdueCanvasCard(ctx, slot, imagePaths, canvasMetrics));
  ctx.draw(false);
}

function getRahdueCanvasMetrics(page) {
  if (typeof Promise === "undefined") {
    return {
      then(callback) {
        callback(createFallbackRahdueCanvasMetrics());
      }
    };
  }

  return new Promise((resolve) => {
    if (typeof wx === "undefined" || !wx.createSelectorQuery) {
      resolve(createFallbackRahdueCanvasMetrics());
      return;
    }

    try {
      const query = wx.createSelectorQuery().in(page);

      query.select(`#${RAHDUE_CANVAS_ID}`).boundingClientRect((rect) => {
        resolve(createRahdueCanvasMetrics(rect));
      }).exec();
    } catch (error) {
      resolve(createFallbackRahdueCanvasMetrics());
    }
  });
}

function createRahdueCanvasMetrics(rect) {
  const fallback = createFallbackRahdueCanvasSize();
  const width = rect && Number(rect.width) > 0 ? Number(rect.width) : fallback.width;
  const height = rect && Number(rect.height) > 0
    ? Number(rect.height)
    : width * (RAHDUE_CANVAS_BASE_HEIGHT / RAHDUE_CANVAS_BASE_WIDTH);

  return {
    width,
    height,
    scale: width / RAHDUE_CANVAS_BASE_WIDTH,
    cardWidth: RAHDUE_CANVAS_BASE_CARD_WIDTH * (width / RAHDUE_CANVAS_BASE_WIDTH),
    cardHeight: RAHDUE_CANVAS_BASE_CARD_HEIGHT * (width / RAHDUE_CANVAS_BASE_WIDTH)
  };
}

function createFallbackRahdueCanvasMetrics() {
  return createRahdueCanvasMetrics(createFallbackRahdueCanvasSize());
}

function createFallbackRahdueCanvasSize() {
  let ratio = 0.5;

  if (typeof wx !== "undefined" && wx.getSystemInfoSync) {
    try {
      const systemInfo = wx.getSystemInfoSync();

      if (systemInfo && systemInfo.windowWidth) {
        ratio = systemInfo.windowWidth / 750;
      }
    } catch (error) {
      ratio = 0.5;
    }
  }

  return {
    width: RAHDUE_CANVAS_BASE_WIDTH * ratio,
    height: RAHDUE_CANVAS_BASE_HEIGHT * ratio
  };
}

function scaleRahdueMetric(metrics, value) {
  return value * metrics.scale;
}

function resolveRahdueCanvasImagePaths(cards, onBatch) {
  const paths = {};
  const queue = cards.slice();
  let chain = Promise.resolve();

  while (queue.length) {
    const batch = queue.splice(0, RAHDUE_CANVAS_IMAGE_BATCH_SIZE);

    chain = chain.then(() => Promise.all(batch.map((card) => resolveRahdueCanvasImagePath(card))).then((entries) => {
      entries.forEach((entry) => {
        if (entry && entry.id && entry.path) {
          paths[entry.id] = entry.path;
        }
      });

      if (typeof onBatch === "function") {
        onBatch(Object.assign({}, paths));
      }
    }));
  }

  return chain.then(() => paths);
}

function resolveRahdueCanvasImagePath(card) {
  return new Promise((resolve) => {
    if (!card || !card.id || !card.imageSrc) {
      resolve(null);
      return;
    }

    if (!wx.getImageInfo) {
      resolve({
        id: card.id,
        path: isRemoteRahdueImagePath(card.imageSrc) ? "" : card.imageSrc
      });
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
        resolveRahdueDownloadedImagePath(card, resolve);
      }
    });
  });
}

function resolveRahdueDownloadedImagePath(card, resolve) {
  if (!wx.downloadFile || !isRemoteRahdueImagePath(card.imageSrc)) {
    resolve({
      id: card.id,
      path: isRemoteRahdueImagePath(card.imageSrc) ? "" : card.imageSrc
    });
    return;
  }

  wx.downloadFile({
    url: card.imageSrc,
    success: (result) => {
      if (result && (!result.statusCode || (result.statusCode >= 200 && result.statusCode < 300)) && result.tempFilePath) {
        resolve({
          id: card.id,
          path: result.tempFilePath
        });
        return;
      }

      resolve({
        id: card.id,
        path: ""
      });
    },
    fail: () => {
      resolve({
        id: card.id,
        path: ""
      });
    }
  });
}

function isRemoteRahdueImagePath(path) {
  return /^https?:\/\//.test(String(path || ""));
}

function drawRahdueGuideGeometry(ctx, metrics) {
  const centerX = metrics.width / 2;
  const centerY = scaleRahdueMetric(metrics, 270);

  [72, 122, 172].forEach((radius) => {
    ctx.beginPath();
    ctx.arc(centerX, centerY, scaleRahdueMetric(metrics, radius), 0, Math.PI * 2);
    ctx.stroke();
  });

  drawRahdueGuideLine(ctx, metrics, 54, 388, 54, 738);
  drawRahdueGuideLine(ctx, metrics, 596, 388, 596, 738);
  drawRahdueGuideLine(ctx, metrics, 92, 792, 558, 792);
  drawRahdueGuideLine(ctx, metrics, 92, 928, 558, 928);

  ctx.setFillStyle("rgba(91, 63, 163, 0.72)");
  ctx.setFontSize(scaleRahdueMetric(metrics, 20));
  ctx.fillText("Inner / Center / Outer", centerX - scaleRahdueMetric(metrics, 104), scaleRahdueMetric(metrics, 38));
  ctx.fillText("Shor", scaleRahdueMetric(metrics, 32), scaleRahdueMetric(metrics, 360));
  ctx.fillText("Taleh", scaleRahdueMetric(metrics, 552), scaleRahdueMetric(metrics, 360));
  ctx.fillText("Dagim", centerX - scaleRahdueMetric(metrics, 34), scaleRahdueMetric(metrics, 760));
  ctx.fillText("Malkuth", centerX - scaleRahdueMetric(metrics, 44), scaleRahdueMetric(metrics, 900));
}

function drawRahdueGuideLine(ctx, metrics, startX, startY, endX, endY) {
  ctx.beginPath();
  ctx.moveTo(scaleRahdueMetric(metrics, startX), scaleRahdueMetric(metrics, startY));
  ctx.lineTo(scaleRahdueMetric(metrics, endX), scaleRahdueMetric(metrics, endY));
  ctx.stroke();
}

function createRahdueCanvasLayout(cards, metrics) {
  const layout = [];
  const centerX = metrics.width / 2;
  const centerY = scaleRahdueMetric(metrics, 270);

  appendWheelRing(layout, cards, 1, 12, centerX, centerY, scaleRahdueMetric(metrics, 72), metrics);
  appendWheelRing(layout, cards, 14, 25, centerX, centerY, scaleRahdueMetric(metrics, 122), metrics);
  appendWheelRing(layout, cards, 27, 38, centerX, centerY, scaleRahdueMetric(metrics, 172), metrics);
  appendSolidifier(layout, cards, 13, centerX, scaleRahdueMetric(metrics, 220), metrics);
  appendSolidifier(layout, cards, 26, centerX - scaleRahdueMetric(metrics, 48), scaleRahdueMetric(metrics, 326), metrics);
  appendSolidifier(layout, cards, 39, centerX + scaleRahdueMetric(metrics, 48), scaleRahdueMetric(metrics, 326), metrics);
  appendCardColumnUp(layout, cards, 50, 58, scaleRahdueMetric(metrics, 584), scaleRahdueMetric(metrics, 720), scaleRahdueMetric(metrics, 42), metrics);
  appendSolidifier(layout, cards, 59, scaleRahdueMetric(metrics, 584), scaleRahdueMetric(metrics, 334), metrics);
  appendCardColumn(layout, cards, 60, 68, scaleRahdueMetric(metrics, 40), scaleRahdueMetric(metrics, 388), scaleRahdueMetric(metrics, 42), metrics);
  appendSolidifier(layout, cards, 69, scaleRahdueMetric(metrics, 40), scaleRahdueMetric(metrics, 774), metrics);
  appendCardRowRightToLeft(layout, cards, 40, 48, scaleRahdueMetric(metrics, 542), scaleRahdueMetric(metrics, 800), scaleRahdueMetric(metrics, 56), metrics);
  appendSolidifier(layout, cards, 49, centerX, scaleRahdueMetric(metrics, 844), metrics);
  appendCardRow(layout, cards, 70, 78, scaleRahdueMetric(metrics, 82), scaleRahdueMetric(metrics, 936), scaleRahdueMetric(metrics, 56), metrics);

  return layout;
}

function appendWheelRing(layout, cards, start, end, centerX, centerY, radius, metrics) {
  for (let position = start; position <= end; position += 1) {
    const offset = position - start;
    const angle = ((offset + 1) / 12) * Math.PI * 2 - Math.PI / 2;
    const x = centerX + Math.cos(angle) * radius - metrics.cardWidth / 2;
    const y = centerY + Math.sin(angle) * radius - metrics.cardHeight / 2;

    appendCanvasCard(layout, cards, position, x, y, angle + Math.PI / 2, false, metrics);
  }
}

function appendCardRow(layout, cards, start, end, originX, originY, gapX, metrics) {
  for (let position = start; position <= end; position += 1) {
    appendCanvasCard(layout, cards, position, originX + (position - start) * gapX, originY, 0, false, metrics);
  }
}

function appendCardRowRightToLeft(layout, cards, start, end, originX, originY, gapX, metrics) {
  for (let position = start; position <= end; position += 1) {
    appendCanvasCard(layout, cards, position, originX - (position - start) * gapX, originY, 0, false, metrics);
  }
}

function appendCardColumn(layout, cards, start, end, originX, originY, gapY, metrics) {
  for (let position = start; position <= end; position += 1) {
    appendCanvasCard(layout, cards, position, originX, originY + (position - start) * gapY, 0, false, metrics);
  }
}

function appendCardColumnUp(layout, cards, start, end, originX, originY, gapY, metrics) {
  for (let position = start; position <= end; position += 1) {
    appendCanvasCard(layout, cards, position, originX, originY - (position - start) * gapY, 0, false, metrics);
  }
}

function appendSolidifier(layout, cards, position, centerX, centerY, metrics) {
  appendCanvasCard(
    layout,
    cards,
    position,
    centerX - metrics.cardWidth / 2,
    centerY - metrics.cardHeight / 2,
    0,
    true,
    metrics
  );
}

function appendCanvasCard(layout, cards, position, x, y, rotation, solidifier, metrics) {
  const card = cards[position - 1];

  if (!card) {
    return;
  }

  layout.push({
    card,
    position,
    x,
    y,
    width: metrics.cardWidth,
    height: metrics.cardHeight,
    rotation: rotation || 0,
    solidifier: Boolean(solidifier)
  });
}

function drawRahdueCanvasCard(ctx, slot, imagePaths, metrics) {
  const rotation = slot.rotation + (slot.card.isReversed ? Math.PI : 0);
  const centerX = slot.x + slot.width / 2;
  const centerY = slot.y + slot.height / 2;
  const imageSrc = imagePaths && imagePaths[slot.card.id] ? imagePaths[slot.card.id] : "";

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(rotation);
  ctx.setFillStyle(slot.solidifier ? "#fff3d5" : "#fffaf0");
  ctx.setStrokeStyle(slot.solidifier ? "rgba(151, 73, 56, 0.62)" : "rgba(91, 63, 163, 0.28)");
  ctx.setLineWidth(scaleRahdueMetric(metrics, slot.solidifier ? 2 : 1));
  ctx.fillRect(-slot.width / 2, -slot.height / 2, slot.width, slot.height);

  if (imageSrc) {
    try {
      ctx.drawImage(imageSrc, -slot.width / 2, -slot.height / 2, slot.width, slot.height);
    } catch (error) {
      drawRahdueCanvasCardNumber(ctx, slot, metrics);
    }
  } else {
    drawRahdueCanvasCardNumber(ctx, slot, metrics);
  }

  ctx.strokeRect(-slot.width / 2, -slot.height / 2, slot.width, slot.height);
  ctx.restore();
}

function drawRahdueCanvasCardNumber(ctx, slot, metrics) {
  ctx.setFillStyle(slot.solidifier ? "rgba(151, 73, 56, 0.78)" : "rgba(91, 63, 163, 0.62)");
  ctx.setFontSize(scaleRahdueMetric(metrics, 12));
  ctx.fillText(String(slot.position), -slot.width / 2 + scaleRahdueMetric(metrics, 3), scaleRahdueMetric(metrics, 4));
}
