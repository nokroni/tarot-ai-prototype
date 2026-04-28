const {
  createAdvancedSpreadOptions,
  createReaderOptions,
  loadAdvancedReadingSelection,
  saveAdvancedReadingSelection
} = require("../../services/reading-options");

Page({
  data: {
    ui: {
      title: "所有牌阵",
      copy: "在这里切换完整牌阵和读牌人。",
      spreadLabel: "牌阵",
      readerLabel: "读牌人",
      spreadGuideTitle: "适合这样问",
      apply: "确认"
    },
    spreads: createPageSpreadOptions(),
    readers: createPageReaderOptions(),
    selectedSpreadId: "threeCard",
    selectedReaderId: "misty"
  },

  onLoad() {
    const selection = loadAdvancedReadingSelection();

    this.setData({
      selectedSpreadId: selection.spreadId,
      selectedReaderId: selection.readerId
    });
  },

  selectSpread(event) {
    this.setData({
      selectedSpreadId: event.currentTarget.dataset.spreadId
    });
  },

  selectReader(event) {
    this.setData({
      selectedReaderId: event.currentTarget.dataset.readerId
    });
  },

  applyAdvancedMode() {
    saveAdvancedReadingSelection({
      spreadId: this.data.selectedSpreadId,
      readerId: this.data.selectedReaderId
    });
    navigateBackToIndex();
  }
});

const spreadQuestionGuides = {
  oneCard: "适合问：我现在需要看见什么？这件事给我的核心提醒是什么？",
  threeCard: "适合问：这件事的现状、阻碍和下一步是什么？",
  timeFlow: "适合问：这件事从过去到现在如何发展，接下来趋势是什么？",
  decisionPair: "适合问：方案 A 和方案 B 哪个更适合我？各自的好处和风险是什么？"
};

const readerGuides = {
  misty: "温柔、克制，适合需要被安静陪伴的时候。",
  johnny: "直接、清醒，适合需要少一点自我糊弄的时候。",
  donovan: "温热、犀利，适合看清主动权和代价。"
};

function createPageSpreadOptions() {
  return createAdvancedSpreadOptions("zh").map((spread) => Object.assign({}, spread, {
    guide: spreadQuestionGuides[spread.id] || ""
  }));
}

function createPageReaderOptions() {
  return createReaderOptions().map((reader) => Object.assign({}, reader, {
    guide: readerGuides[reader.id] || ""
  }));
}

function navigateBackToIndex() {
  const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];

  if (pages.length > 1 && wx.navigateBack) {
    wx.navigateBack();
    return;
  }

  wx.redirectTo({
    url: "/pages/index/index"
  });
}
