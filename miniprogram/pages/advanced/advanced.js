const {
  createAdvancedSpreadOptions,
  createReaderOptions,
  loadAdvancedReadingSelection,
  saveAdvancedReadingSelection,
  saveSimpleReadingMode
} = require("../../services/reading-options");

Page({
  data: {
    ui: {
      title: "完整牌阵",
      copy: "在这里切换完整牌阵和读牌人。返回主页后，主页仍保持简洁，只保留问题栏、提交和牌组。",
      spreadLabel: "牌阵",
      readerLabel: "读牌人",
      apply: "使用完整模式",
      simple: "回到单牌 Misty"
    },
    spreads: createAdvancedSpreadOptions("zh"),
    readers: createReaderOptions(),
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
  },

  returnSimpleMode() {
    saveSimpleReadingMode();
    navigateBackToIndex();
  }
});

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
