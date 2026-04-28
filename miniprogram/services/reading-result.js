const READING_RESULT_STORAGE_KEY = "tarot_latest_reading_result";

function saveLatestReadingResult(result) {
  if (typeof wx === "undefined" || !wx.setStorageSync) {
    return false;
  }

  try {
    wx.setStorageSync(READING_RESULT_STORAGE_KEY, result);
    return true;
  } catch (error) {
    return false;
  }
}

function loadLatestReadingResult() {
  if (typeof wx === "undefined" || !wx.getStorageSync) {
    return null;
  }

  try {
    return wx.getStorageSync(READING_RESULT_STORAGE_KEY) || null;
  } catch (error) {
    return null;
  }
}

module.exports = {
  READING_RESULT_STORAGE_KEY,
  loadLatestReadingResult,
  saveLatestReadingResult
};
