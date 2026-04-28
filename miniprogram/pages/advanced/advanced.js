const {
  RAHDUE_SPREAD_ID,
  createAdvancedSpreadOptions,
  createReaderOptions,
  loadAdvancedReadingSelection,
  saveAdvancedReadingSelection
} = require("../../services/reading-options");

const spreadQuestionGuides = {
  oneCard: "适合问：我现在需要看见什么？这件事给我的核心提醒是什么？",
  threeCard: "适合问：这件事的现状、阻碍和下一步是什么？",
  timeFlow: "适合问：这件事从过去到现在如何发展，接下来趋势是什么？",
  decisionPair: "适合问：方案 A 和方案 B 哪个更适合我？各自的好处和风险是什么？",
  rahdueWheel: "适合问：需要用完整牌组观察长期模式、灵魂主题或复杂人生结构时。"
};

const readerGuides = {
  misty: "温柔、克制，适合需要被安静陪伴的时候。",
  johnny: "直接、清醒，适合需要少一点自我糊弄的时候。",
  donovan: "温热、犀利，适合看清主动权和代价。"
};

Page({
  data: {
    ui: {
      title: "所有牌阵",
      copy: "在这里切换完整牌阵和读牌人。",
      spreadLabel: "牌阵",
      readerLabel: "读牌人",
      spreadGuideTitle: "适合这样问",
      rahdueHandDrawnLabel: "Complete handdrawn",
      rahdueHandDrawnHint: "手动选择完整 78 张牌。过程会很长，默认会自动完成完整牌组。",
      rahdueHandDrawnConfirmTitle: "Are you really sure?",
      rahdueHandDrawnConfirmCopy: "Complete handdrawn mode means you will choose all 78 cards one by one before the reading starts.",
      apply: "确认"
    },
    spreads: createPageSpreadOptions(),
    readers: createPageReaderOptions(),
    selectedSpreadId: "threeCard",
    selectedReaderId: "misty",
    rahdueHandDrawn: false
  },

  onLoad() {
    const selection = loadAdvancedReadingSelection();

    this.setData({
      selectedSpreadId: selection.spreadId,
      selectedReaderId: selection.readerId,
      rahdueHandDrawn: Boolean(selection.rahdueHandDrawn)
    });
  },

  selectSpread(event) {
    const selectedSpreadId = event.currentTarget.dataset.spreadId;

    this.setData({
      selectedSpreadId,
      rahdueHandDrawn: selectedSpreadId === RAHDUE_SPREAD_ID ? this.data.rahdueHandDrawn : false
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
      readerId: this.data.selectedReaderId,
      rahdueHandDrawn: this.data.selectedSpreadId === RAHDUE_SPREAD_ID && this.data.rahdueHandDrawn
    });
    navigateBackToIndex();
  },

  toggleRahdueHandDrawn(event) {
    const values = event.detail && Array.isArray(event.detail.value) ? event.detail.value : [];
    const shouldEnable = values.indexOf("handDrawn") !== -1;

    if (!shouldEnable) {
      this.setData({
        rahdueHandDrawn: false
      });
      return;
    }

    if (typeof wx === "undefined" || !wx.showModal) {
      this.setData({
        rahdueHandDrawn: true
      });
      return;
    }

    wx.showModal({
      title: this.data.ui.rahdueHandDrawnConfirmTitle,
      content: this.data.ui.rahdueHandDrawnConfirmCopy,
      confirmText: "Yes",
      cancelText: "Cancel",
      success: (result) => {
        this.setData({
          rahdueHandDrawn: Boolean(result && result.confirm)
        });
      },
      fail: () => {
        this.setData({
          rahdueHandDrawn: false
        });
      }
    });
  }
});

function createPageSpreadOptions() {
  return createAdvancedSpreadOptions("zh").map((spread) => Object.assign({}, spread, {
    guide: spread.guide || spreadQuestionGuides[spread.id] || ""
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
