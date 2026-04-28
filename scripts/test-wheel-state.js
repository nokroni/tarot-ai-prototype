const assert = require("assert");
const fs = require("fs");
const sharp = require("sharp");
const {
  assertValidReading,
  createFallbackReading,
  createReadingRequest,
  normalizeReading,
  readingJsonSchema
} = require("../miniprogram/services/reading-schema");
const { buildReadingMessages } = require("../miniprogram/prompts/system-prompt");

let pageDefinition = null;
const originalSetTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;
const WHEEL_TEST_SCROLL_LEFT = 48;
const WHEEL_DRAWING_SCROLL_LEFT = 64;
const WHEEL_LAST_SCROLL_LEFT = 1232;
const REMOTE_ASSET_BASE_URL = "https://express-6a5b-251593-6-1425965613.sh.run.tcloudbase.com/assets/tarot";
let vibrationCount = 0;
let nextTimerId = 1;
let pendingTimers = [];
const audioContexts = [];
let audioOptionConfig = null;
const wxStorage = {};
let navigatedToUrl = "";

global.Page = (definition) => {
  pageDefinition = definition;
};

global.wx = {
  getSystemInfoSync() {
    return {
      windowWidth: 375
    };
  },
  vibrateShort() {
    vibrationCount += 1;
  },
  setInnerAudioOption(options) {
    audioOptionConfig = clone(options);
  },
  createInnerAudioContext() {
    const audioContext = createMockAudioContext();

    audioContexts.push(audioContext);
    return audioContext;
  },
  getStorageSync(key) {
    return wxStorage[key];
  },
  setStorageSync(key, value) {
    wxStorage[key] = value;
  },
  navigateTo(options) {
    navigatedToUrl = options.url;
  },
  redirectTo(options) {
    navigatedToUrl = options.url;
  }
};

global.setTimeout = (callback, delay) => {
  const id = nextTimerId;

  nextTimerId += 1;
  pendingTimers.push({
    id,
    callback,
    delay: Number(delay) || 0
  });

  return id;
};

global.clearTimeout = (id) => {
  pendingTimers = pendingTimers.filter((timer) => timer.id !== id);
};

require("../miniprogram/pages/index/index.js");

assert(pageDefinition, "Page definition should be registered.");
assert.strictEqual(pageDefinition.data.language, "zh", "Miniapp should default to Chinese.");
assert.deepStrictEqual(
  pageDefinition.data.languages.map((language) => [language.id, language.title]),
  [["zh", "中文"], ["en", "English"]],
  "Language selector should expose readable Chinese and English options."
);
assert.strictEqual(pageDefinition.data.spreads.length, 4, "Miniapp should still know every complete spread option.");
assert.deepStrictEqual(
  pageDefinition.data.spreads.map((spread) => [spread.id, spread.insight]),
  [
    ["oneCard", "- Light another candle"],
    ["threeCard", "- Everything in its right place"],
    ["timeFlow", "- Yesterday I woke up sucking a lemon"],
    ["decisionPair", "- There are two colours in my head"]
  ],
  "Each spread should expose the requested insight quote."
);
assert.deepStrictEqual(
  pageDefinition.data.spreads.find((spread) => spread.id === "timeFlow"),
  {
    id: "timeFlow",
    title: "时间流",
    positions: ["过去", "现在", "未来"],
    insight: "- Yesterday I woke up sucking a lemon"
  },
  "Time-flow spread should represent past, now, and future."
);
assert.deepStrictEqual(
  pageDefinition.data.spreads.find((spread) => spread.id === "decisionPair"),
  {
    id: "decisionPair",
    title: "决策双牌",
    positions: ["方案 A", "方案 B"],
    insight: "- There are two colours in my head"
  },
  "Decision-making spread should compare two options."
);
assert.strictEqual(pageDefinition.data.readerProfiles.length, 3, "Reader picker should include all three personalities.");
assert.strictEqual(pageDefinition.data.selectedReaderId, "misty", "Misty should be the default reader.");
assert.strictEqual(pageDefinition.data.selectedSpreadId, "oneCard", "The home page should default to a single-card spread.");
assert.deepStrictEqual(pageDefinition.data.selectedSpread.positions, ["指引"], "Single-card mode should use one guidance position.");
assert.strictEqual(pageDefinition.data.readingMode, "simple", "The home page should open in simple mode.");
assert.strictEqual(pageDefinition.data.modeSummary, "单牌 · Misty", "The compact mode summary should describe the simple home mode.");
assert.strictEqual(pageDefinition.data.wheelCards.length, 78, "Idle deck should render through the complete wheel deck.");
assert.strictEqual(pageDefinition.data.wheel.motion, "idle", "Initial deck should use the idle wheel state.");
assert(
  pageDefinition.data.wheelCards[0].slotStyle.includes("z-index: 78") &&
    pageDefinition.data.wheelCards[0].arcStyle.includes("translate(0rpx, 32rpx)") &&
    pageDefinition.data.wheelCards[0].arcStyle.includes("rotate(0.0deg)") &&
    pageDefinition.data.wheelCards[7].slotStyle.includes("z-index: 71") &&
    pageDefinition.data.wheelCards[7].arcStyle.includes("translate(-222rpx, 28rpx)") &&
    pageDefinition.data.wheelCards[7].arcStyle.includes("rotate(0.4deg)") &&
    pageDefinition.data.wheelCards[77].slotStyle.includes("z-index: 1") &&
    pageDefinition.data.wheelCards[77].arcStyle.includes("translate(-2440rpx, -8rpx)") &&
    pageDefinition.data.wheelCards[77].arcStyle.includes("rotate(4.8deg)"),
  "Idle deck should be the wheel deck itself, tightly piled and rising toward the right."
);
assert.deepStrictEqual(
  pageDefinition.data.readerProfiles.map((reader) => reader.id),
  ["misty", "johnny", "donovan"],
  "Reader picker should expose Misty, Johnny, and Donovan in order."
);
assert.deepStrictEqual(
  pageDefinition.data.decisionOptions,
  {
    planA: "",
    planB: ""
  },
  "Decision-pair input should keep plan A and plan B separately."
);
assert.deepStrictEqual(
  pageDefinition.data.music,
  {
    enabled: true,
    playing: false,
    currentTrack: "intro"
  },
  "Music should be enabled by default and ready to start with the intro track."
);

const context = {
  data: clone(pageDefinition.data),
  _interpreted: false,
  setData(update) {
    const nextData = clone(this.data);

    Object.keys(update).forEach((key) => {
      setDataPath(nextData, key, clone(update[key]));
    });

    this.data = nextData;
  },
  applyReadingModeFromStorage: pageDefinition.applyReadingModeFromStorage,
  drawCards: pageDefinition.drawCards,
  interpretReading() {
    this._interpreted = true;
  }
};

pageDefinition.goAdvancedMode.call(context);
assert.strictEqual(navigatedToUrl, "/pages/advanced/advanced", "Mode change should navigate to the complete spreads/readers page.");

pageDefinition.onReady.call(context);
assert.strictEqual(context.data.assets.ready, true, "Page ready should activate remote asset paths before opening the app.");
assert.strictEqual(context.data.assets.progress, 100, "Remote asset loader should complete before the page opens.");
assert.strictEqual(context.data.assets.resourceLabel, "高清资源", "Successful remote media loading should show the high-resolution resource badge.");
assert.strictEqual(audioContexts.length, 2, "Page ready should create music and intro rain audio contexts.");
assert.deepStrictEqual(audioOptionConfig, { obeyMuteSwitch: false }, "Music should ignore the phone mute switch when WeChat allows it.");
assert.strictEqual(audioContexts[0].src, `${REMOTE_ASSET_BASE_URL}/music/bgm_intro.m4a`, "Loaded page should start with the remote intro track.");
assert.strictEqual(audioContexts[0].playCount, 1, "Intro music should start once the page is ready.");
assert.strictEqual(context.data.music.playing, true, "Music state should report playback after page ready.");
assert.strictEqual(audioContexts[1].src, `${REMOTE_ASSET_BASE_URL}/music/sfx_intro_rain.m4a`, "Loaded page should start the remote intro rain bed.");
assert.strictEqual(audioContexts[1].loop, true, "Intro rain should loop until the first draw starts.");
assert.strictEqual(audioContexts[1].playCount, 1, "Intro rain should start once the page is ready.");
assert.strictEqual(audioContexts[1].volume, 0, "Intro rain should begin silently before fading in.");
runNextTimerByDelay(100);
assert(audioContexts[1].volume > 0 && audioContexts[1].volume < 0.34, "Intro rain should fade in gently over the first second.");
assert.strictEqual(runAllTimersByDelay(100), 9, "Intro rain fade-in should finish in about one second.");
assert.strictEqual(audioContexts[1].volume, 0.34, "Intro rain should settle at the requested doubled volume.");

audioContexts[0].triggerEnded();
assert.strictEqual(audioContexts[0].src, `${REMOTE_ASSET_BASE_URL}/music/bgm_intro_bar.m4a`, "Intro should hand off to intro_bar when it finishes.");
assert.strictEqual(context.data.music.currentTrack, "introBar", "Music state should track the intro_bar segment.");

audioContexts[0].triggerEnded();
assert.strictEqual(audioContexts[0].src, `${REMOTE_ASSET_BASE_URL}/music/bgm_intro.m4a`, "Intro_bar should hand back to intro for the next loop.");
assert.strictEqual(context.data.music.currentTrack, "intro", "Music loop should return to intro after intro_bar.");

pageDefinition.toggleMusic.call(context);
assert.strictEqual(context.data.music.enabled, false, "Music toggle should switch playback off.");
assert.strictEqual(context.data.music.playing, false, "Music toggle should mark playback as stopped.");
assert(audioContexts[0].stopCount >= 3, "Music toggle should stop the audio context when disabled.");
assert(audioContexts[1].stopCount >= 1, "Music toggle should also stop the intro rain when disabled.");
assert.strictEqual(audioContexts[0].destroyed, true, "Music toggle should tear down the music context so muted audio cannot keep playing.");
assert.strictEqual(audioContexts[1].destroyed, true, "Music toggle should tear down the rain context so muted rain cannot keep playing.");

pageDefinition.toggleMusic.call(context);
assert.strictEqual(context.data.music.enabled, true, "Music toggle should switch playback back on.");
assert.strictEqual(audioContexts.length, 4, "Music toggle should create fresh audio contexts after a hard mute.");
let activeMusicAudio = audioContexts[2];
let activeRainAudio = audioContexts[3];
assert.strictEqual(activeMusicAudio.src, `${REMOTE_ASSET_BASE_URL}/music/bgm_intro.m4a`, "Music toggle should resume the current loop segment.");
assert.strictEqual(context.data.music.playing, true, "Music toggle should report playback only after audio play starts.");
assert.strictEqual(activeRainAudio.src, `${REMOTE_ASSET_BASE_URL}/music/sfx_intro_rain.m4a`, "Music toggle should resume intro rain before the draw starts.");
assert(activeRainAudio.playCount >= 1, "Music toggle should restart intro rain when audio is enabled again.");

const musicStopCountBeforePendingMute = activeMusicAudio.stopCount;
const rainStopCountBeforePendingMute = activeRainAudio.stopCount;
context.setData({
  "music.enabled": true,
  "music.playing": false
});
pageDefinition.toggleMusic.call(context);
assert.strictEqual(context.data.music.enabled, false, "Music toggle should mute even if playback is pending or recovering.");
assert.strictEqual(context.data.music.playing, false, "Pending-state mute should keep playback marked as stopped.");
assert(activeMusicAudio.stopCount > musicStopCountBeforePendingMute, "Pending-state mute should still stop the music context.");
assert(activeRainAudio.stopCount > rainStopCountBeforePendingMute, "Pending-state mute should still stop the intro rain context.");
assert.strictEqual(activeMusicAudio.destroyed, true, "Pending-state mute should destroy the old music context.");
assert.strictEqual(activeRainAudio.destroyed, true, "Pending-state mute should destroy the old rain context.");
activeMusicAudio.triggerPlay();
activeRainAudio.triggerPlay();
assert.strictEqual(context.data.music.enabled, false, "Late audio play events should not turn music back on after mute.");
assert.strictEqual(context.data.music.playing, false, "Late audio play events should keep muted music marked as stopped.");
assert.strictEqual(activeMusicAudio.stopCount, musicStopCountBeforePendingMute + 1, "Late play events from stale music contexts should be ignored after hard mute.");
assert.strictEqual(activeRainAudio.stopCount, rainStopCountBeforePendingMute + 1, "Late play events from stale rain contexts should be ignored after hard mute.");

pageDefinition.toggleMusic.call(context);
assert.strictEqual(context.data.music.enabled, true, "Music toggle should recover after muting from a pending state.");
assert.strictEqual(context.data.music.playing, true, "Music toggle should restart playback after pending-state mute.");
assert.strictEqual(audioContexts.length, 6, "Music recovery should use a fresh audio session after pending-state mute.");
activeMusicAudio = audioContexts[4];
activeRainAudio = audioContexts[5];

activeMusicAudio.triggerError();
assert.strictEqual(context.data.music.enabled, true, "A failed remote audio attempt should keep music enabled.");
assert.strictEqual(activeMusicAudio.src, "/music/bgm_intro_fallback.m4a", "Remote music errors should retry the bundled local intro track.");
assert.strictEqual(context.data.music.playing, true, "Local music fallback should immediately restore playback.");

activeRainAudio.triggerError();
assert.strictEqual(activeRainAudio.src, "/music/sfx_intro_rain_fallback.m4a", "Remote rain errors should retry the bundled local rain bed.");
assert(activeRainAudio.playCount >= 2, "Rain fallback should restart without waiting for another user gesture.");
assert.strictEqual(activeRainAudio.volume, 0, "Rain fallback should restart from silence before fading back in.");
assert.strictEqual(runAllTimersByDelay(100), 10, "Rain fallback fade-in should complete in about one second.");
assert.strictEqual(activeRainAudio.volume, 0.34, "Rain fallback should settle at the doubled ambient volume.");

pageDefinition.onDecisionOptionInput.call(context, {
  currentTarget: {
    dataset: {
      option: "planA"
    }
  },
  detail: {
    value: "方案 A"
  }
});
pageDefinition.onDecisionOptionInput.call(context, {
  currentTarget: {
    dataset: {
      option: "planB"
    }
  },
  detail: {
    value: "方案 B"
  }
});
pageDefinition.onQuestionInput.call(context, {
  detail: {
    value: "我应该选择哪一个方案？"
  }
});
assert.strictEqual(context.data.question, "我应该选择哪一个方案？", "Decision-pair question dialogue should update the shared question field.");
assert.strictEqual(context.data.decisionOptions.planA, "方案 A", "Plan A input should update only the plan A field.");
assert.strictEqual(context.data.decisionOptions.planB, "方案 B", "Plan B input should update only the plan B field.");

context.data.interpretation = {
  summary: "old reading"
};
pageDefinition.selectReader.call(context, {
  currentTarget: {
    dataset: {
      readerId: "johnny"
    }
  }
});
assert.strictEqual(context.data.selectedReaderId, "johnny", "Reader selector should switch to Johnny.");
assert.strictEqual(context.data.selectedReader.title, "Johnny", "Selected reader metadata should update.");
assert.strictEqual(context.data.interpretation, null, "Changing reader should clear the stale interpretation.");
assert.strictEqual(context.data.drawnCards.length, 0, "Changing reader should not force a redraw.");

pageDefinition.selectLanguage.call(context, {
  currentTarget: {
    dataset: {
      language: "en"
    }
  }
});
assert.strictEqual(context.data.language, "en", "Language selector should switch to English.");
assert.strictEqual(context.data.ui.title, "Tarot", "English UI copy should update the hero title.");
assert.strictEqual(context.data.selectedSpread.title, "Single Card", "Selected home spread title should localize to English.");
assert.deepStrictEqual(context.data.selectedSpread.positions, ["Guidance"], "Selected home spread position should localize to English.");
assert.strictEqual(context.data.assets.resourceLabel, "High-res", "Resource badge should localize when switching to English.");

pageDefinition.selectLanguage.call(context, {
  currentTarget: {
    dataset: {
      language: "zh"
    }
  }
});
assert.strictEqual(context.data.language, "zh", "Language selector should switch back to Chinese.");
assert.strictEqual(context.data.ui.title, "塔罗牌", "Chinese UI copy should restore the hero title.");

const idleWheelCardIds = context.data.wheelCards.map((slot) => slot.id).join("|");
pageDefinition.tapDeckStage.call(context);

assert.strictEqual(context.data.buildLabel, "0.9.1 双语版本", "Build label should identify the 0.9.1 bilingual build.");
assert.strictEqual(context.data.wheel.isOpen, true, "Tapping the closed pile should mount the wheel like the submit button.");
assert.strictEqual(
  context.data.wheelCards.map((slot) => slot.id).join("|"),
  idleWheelCardIds,
  "Drawing should reuse the same keyed card nodes that formed the idle pile."
);
const openedWheelCardIds = context.data.wheelCards.map((slot) => slot.id).join("|");
pageDefinition.tapDeckStage.call(context);
assert.strictEqual(
  context.data.wheelCards.map((slot) => slot.id).join("|"),
  openedWheelCardIds,
  "Tapping the draw region while the wheel is open should not rebuild the deck."
);
assert.strictEqual(context.data.wheel.requiredCount, 1, "Simple home mode should require one selection.");
assert.strictEqual(context.data.wheel.scrollLeft, 0, "Wheel should start at the first preassigned slot.");
assert.strictEqual(context.data.wheel.scrollIntoView, "", "Wheel should not control native scroll during normal choosing.");
assert.strictEqual(context.data.wheel.scrollWithAnimation, false, "Wheel should not animate native scroll during normal choosing.");
assert.strictEqual(context.data.wheel.activeIndex, 0, "Wheel should start with the first slot highlighted.");
assert.strictEqual(context.data.wheel.motion, "spreading", "Wheel should directly expand from the partial idle arc.");
assert.strictEqual(context.data.wheel.currentDrawPosition, "指引", "Wheel caption should include the single-card guidance position.");
assert.strictEqual(context._rainDismissed, true, "Starting a draw should dismiss the intro rain bed.");
assert.strictEqual(activeRainAudio.destroyed, false, "Starting a draw should fade the intro rain before destroying it.");
assert(pendingTimers.some((timer) => timer.delay === 100), "Starting a draw should schedule a one-second rain fade-out.");
const rainVolumeBeforeDrawFade = activeRainAudio.volume;
assert.strictEqual(context.data.wheelCards.length, 78, "Wheel should contain the complete 78-card deck.");
assert.strictEqual(context.data.wheel.cardBackSrc, `${REMOTE_ASSET_BASE_URL}/cards/card-back.png`, "Wheel should use the remote card back.");
assert.deepStrictEqual(
  context.data.wheelCards.find((slot) => slot.cardId === "ten_of_wands").uprightMeanings,
  ["负担", "压力", "责任", "过度承担"],
  "Ten of Wands should carry burden and pressure instead of generic ten-plus-wands meanings."
);
assert.deepStrictEqual(
  context.data.wheelCards.find((slot) => slot.cardId === "four_of_cups").uprightMeanings,
  ["冷淡", "不满", "重新评估", "情绪停滞"],
  "Minor cards should use card-specific Chinese keyword clusters."
);
assert.deepStrictEqual(
  ["ace_of_wands", "ace_of_cups", "ace_of_swords", "ace_of_pentacles"].map((cardId) => (
    context.data.wheelCards.find((slot) => slot.cardId === cardId).name
  )),
  ["权杖一", "圣杯一", "宝剑一", "星币一"],
  "Ace card display names should use 一 instead of the old ace label."
);
assert(
  context.data.wheelCards.every((slot) => !slot.name.includes("\u738b\u724c")),
  "No displayed wheel card name should contain the old ace label."
);
assert.strictEqual(
  context.data.wheelCards.find((slot) => slot.cardId === "the_lovers").imageSrc,
  `${REMOTE_ASSET_BASE_URL}/cards/TheLovers.jpg`,
  "Card face overrides should resolve to remote card art."
);
assert.strictEqual(
  context.data.wheelCards.find((slot) => slot.cardId === "ace_of_cups").imageSrc,
  `${REMOTE_ASSET_BASE_URL}/cards/aceofcups.jpeg`,
  "Generated minor-card image paths should resolve to remote card art."
);
assert.deepStrictEqual(
  context.data.wheelCards.find((slot) => slot.cardId === "king_of_pentacles").reversedMeanings,
  ["贪婪", "僵化", "地位执着", "控制资源"],
  "Pentacles/Coins court cards should use specific material-world risks."
);
assert(
  context.data.wheelCards[0].arcStyle.includes("translate(0rpx, 32rpx)") &&
    context.data.wheelCards[7].arcStyle.includes("translate(-222rpx, 28rpx)") &&
    context.data.wheelCards[7].arcStyle.includes("rotate(0.4deg)") &&
    context.data.wheelCards[77].arcStyle.includes("translate(-2440rpx, -8rpx)") &&
    context.data.wheelCards[77].arcStyle.includes("rotate(4.8deg)"),
  "Wheel cards should initially match the same tight idle pile."
);
assert(pendingTimers.some((timer) => timer.delay === 80), "Wheel should schedule the direct arc expansion on the next visual beat.");

runNextTimerByDelay(80);

assert.strictEqual(context.data.wheel.motion, "spreading", "Wheel should animate from the partial idle arc into the full arc.");
assert(pendingTimers.some((timer) => timer.delay === 1120), "Wheel spread should take twice as long before the rail becomes interactive.");
assert(
  context.data.wheelCards[0].arcStyle.includes("translate(0rpx, 32rpx)") &&
    context.data.wheelCards[7].arcStyle.includes("translate(395rpx, -363rpx)") &&
    context.data.wheelCards[7].arcStyle.includes("rotate(57.0deg)"),
  "Spreading cards should target the exposed upper-left 60-degree circle arc."
);
runNextTimerByDelay(100);
assert(activeRainAudio.volume < rainVolumeBeforeDrawFade, "Intro rain should fade down after the wheel opens.");
assert.strictEqual(runAllTimersByDelay(100), 9, "Intro rain fade-out should finish in about one second.");
assert.strictEqual(activeRainAudio.destroyed, true, "Intro rain should stop after the fade-out completes.");

runNextTimerByDelay(1120);

assert.strictEqual(context.data.wheel.motion, "arc", "Wheel should become interactive after the spread animation.");

pageDefinition.onWheelNativeScroll.call(context, {
  detail: {
    scrollLeft: WHEEL_TEST_SCROLL_LEFT
  }
});

assert(vibrationCount > 0, "Wheel should vibrate when a card crosses the active selection highlight.");
assert.strictEqual(context.data.wheel.activeIndex, 3, "Native scroll position should map to the centered highlighted slot.");
assert.strictEqual(context._wheelScrollLeft, WHEEL_TEST_SCROLL_LEFT, "Native scroll position should be retained without a forced scroll snap.");
assert.strictEqual(context.data.wheel.scrollLeft, 0, "Free scrolling should not write back to a controlled scroll position.");
assert.strictEqual(context.data.wheel.selectedIndex, -1, "Scrolling should keep the wheel in choosing mode.");
assert(
  context.data.wheelCards[3].arcStyle.includes("translate(0rpx, 32rpx)") &&
    context.data.wheelCards[0].arcStyle.includes("translate(-97rpx, 254rpx)") &&
    context.data.wheelCards[0].arcStyle.includes("rotate(-24.4deg)") &&
    context.data.wheelCards[6].arcStyle.includes("translate(144rpx, -163rpx)") &&
    context.data.wheelCards[6].arcStyle.includes("rotate(24.4deg)"),
  "Wheel presentation should update only when the nearest centered card changes."
);

const stableCardStyles = context.data.wheelCards.map((slot) => slot.arcStyle).join("|");

pageDefinition.onWheelNativeScroll.call(context, {
  detail: {
    scrollLeft: WHEEL_TEST_SCROLL_LEFT + 4
  }
});

assert.strictEqual(context.data.wheel.activeIndex, 3, "Fractional scroll inside the same slot should keep the highlighted card.");
assert.strictEqual(
  context.data.wheelCards.map((slot) => slot.arcStyle).join("|"),
  stableCardStyles,
  "Native scroll should carry fractional motion without forcing JS arc churn."
);
assert.strictEqual(context.data.wheel.scrollLeft, 0, "Free scroll should not write back to the native scroll prop.");

pageDefinition.onWheelNativeScroll.call(context, {
  detail: {
    scrollLeft: WHEEL_LAST_SCROLL_LEFT
  }
});

assert.strictEqual(context.data.wheel.activeIndex, 77, "Wheel should allow snapping to the final deck slot.");
assert.strictEqual(context._wheelScrollLeft, WHEEL_LAST_SCROLL_LEFT, "Final deck slot should be reachable by native scroll.");
assert.strictEqual(context.data.wheel.scrollLeft, 0, "Final native scroll should still avoid controlled scrollLeft writeback.");
assert(
  context.data.wheelCards[77].arcStyle.includes("translate(0rpx, 32rpx)") &&
    context.data.wheelCards[76].arcStyle.includes("translate(-38rpx, 103rpx)") &&
    context.data.wheelCards[76].arcStyle.includes("rotate(-8.1deg)"),
  "Final deck slot should own the centered visual curve."
);
assert(
  context.data.wheelCards[69].arcStyle.includes("translate(-142rpx, 653rpx)") &&
    context.data.wheelCards[69].arcStyle.includes("rotate(-65.1deg)") &&
    context.data.wheelCards[68].arcStyle.includes("rotate(-73.3deg)") &&
    context.data.wheelCards[65].arcStyle.includes("rotate(-97.7deg)") &&
    context.data.wheelCards[65].arcStyle.includes("opacity: 0.48;"),
  "Final-slot tail cards should keep curving out of view instead of flattening into a horizontal row."
);

pageDefinition.onWheelNativeScroll.call(context, {
  detail: {
    scrollLeft: WHEEL_TEST_SCROLL_LEFT
  }
});

const uniqueCards = new Set(context.data.wheelCards.map((slot) => slot.cardId));
assert.strictEqual(uniqueCards.size, 78, "Wheel slots should map to unique card faces.");

const pageStyles = fs.readFileSync("miniprogram/pages/index/index.wxss", "utf8");
const pageMarkup = fs.readFileSync("miniprogram/pages/index/index.wxml", "utf8");
const pageScript = fs.readFileSync("miniprogram/pages/index/index.js", "utf8");
const readingOptionsScript = fs.readFileSync("miniprogram/services/reading-options.js", "utf8");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const appManifest = fs.readFileSync("miniprogram/app.json", "utf8");
const advancedMarkup = fs.readFileSync("miniprogram/pages/advanced/advanced.wxml", "utf8");
const advancedStyles = fs.readFileSync("miniprogram/pages/advanced/advanced.wxss", "utf8");
const advancedScript = fs.readFileSync("miniprogram/pages/advanced/advanced.js", "utf8");
const advancedJson = fs.readFileSync("miniprogram/pages/advanced/advanced.json", "utf8");
const readingMarkup = fs.readFileSync("miniprogram/pages/reading/reading.wxml", "utf8");
const readingStyles = fs.readFileSync("miniprogram/pages/reading/reading.wxss", "utf8");
const readingScript = fs.readFileSync("miniprogram/pages/reading/reading.js", "utf8");
const readingJson = fs.readFileSync("miniprogram/pages/reading/reading.json", "utf8");
const readingResultScript = fs.readFileSync("miniprogram/services/reading-result.js", "utf8");
const wheelStartSpacerStyle = pageStyles.match(/\.wheel-spacer-start\s*{[^}]+}/);
const wheelEndSpacerStyle = pageStyles.match(/\.wheel-spacer-end\s*{[^}]+}/);
const wheelCardSlotStyle = pageStyles.match(/\.wheel-card-slot\s*{[^}]+}/);
const wheelStageStyle = pageStyles.match(/(?:^|\n)\.wheel-stage\s*{[^}]+}/);
const wheelFlightCardStyle = pageStyles.match(/(?:^|\n)\.wheel-flight-card\s*{[^}]+}/);
const motionBlockStyle = pageStyles.match(/\.motion-block\s*{[^}]+}/);
const deckStageStyle = pageStyles.match(/\.deck-stage\s*{[^}]+}/);
const deckStageWheelStyle = pageStyles.match(/\.deck-stage-wheel\s*{[^}]+}/);
const wheelCopyStyle = pageStyles.match(/(?:^|\n)\.wheel-copy\s*{[^}]+}/);
const wheelStartSpacerRpx = extractRpxValue(wheelStartSpacerStyle, "width");
const wheelEndSpacerRpx = extractRpxValue(wheelEndSpacerStyle, "width");
const wheelSlotWidthRpx = extractRpxValue(wheelCardSlotStyle, "width");
const wheelSlotMarginRpx = extractRpxValue(wheelCardSlotStyle, "margin-right");
const wheelStrideRpx = wheelSlotWidthRpx + wheelSlotMarginRpx;
const wheelViewportRpx = 686;
const wheelMaxScrollRpx = wheelStartSpacerRpx + wheelEndSpacerRpx + (pageDefinition.data.wheelCards.length * wheelStrideRpx) - wheelViewportRpx;
const wheelLastSlotScrollRpx = (pageDefinition.data.wheelCards.length - 1) * wheelStrideRpx;

assert(
  pageStyles.includes(".wheel-card-face") &&
    pageStyles.includes("width: 188rpx;") &&
    pageStyles.includes("height: 330rpx;") &&
    !pageStyles.includes(".cards-grid") &&
    !pageStyles.includes(".card-face {"),
  "Home page should keep card imagery inside the deck/wheel instead of restoring the old drawn-card grid."
);
assert(
  !fs.existsSync("iOS") &&
    !fs.existsSync("Sources") &&
    !fs.existsSync("Tests") &&
    !fs.existsSync("Package.swift") &&
    !fs.existsSync("server") &&
    !fs.existsSync("scripts/deploy-cloudrun.js") &&
    !fs.existsSync("scripts/test-reading-retry.js") &&
    !packageJson.scripts.backend &&
    !packageJson.scripts["backend:check"] &&
    !packageJson.scripts["deploy:cloudrun"],
  "Repository should keep only Mini Program code and tooling, without the Swift app or unused backend scaffolding."
);
assert(
  pageMarkup.includes('wx:if="{{!assets.ready}}"') &&
    pageMarkup.includes('class="asset-gate"') &&
    pageMarkup.includes("{{assets.progress}}%") &&
    pageMarkup.includes('bindtap="retryLoadAssets"') &&
    pageMarkup.includes('wx:else class="main-flow') &&
    pageStyles.includes(".asset-gate") &&
    pageStyles.includes(".asset-progress-fill"),
  "Miniapp should hold the page on a loading gate until remote assets are ready."
);
assert(
  appManifest.includes('"pages/advanced/advanced"') &&
    fs.existsSync("miniprogram/pages/advanced/advanced.js") &&
    fs.existsSync("miniprogram/pages/advanced/advanced.wxml") &&
    advancedJson.includes('"navigationBarTitleText": "所有牌阵"') &&
    advancedScript.includes('title: "所有牌阵"') &&
    advancedScript.includes('copy: "在这里切换完整牌阵和读牌人。"') &&
    advancedScript.includes('apply: "确认"') &&
    advancedScript.indexOf("const spreadQuestionGuides") < advancedScript.indexOf("Page({") &&
    advancedScript.indexOf("const readerGuides") < advancedScript.indexOf("Page({") &&
    advancedMarkup.includes('class="option-grid spread-grid"') &&
    advancedMarkup.includes('class="option-grid reader-grid"') &&
    advancedMarkup.includes('class="reader-guide"') &&
    advancedMarkup.includes('class="spread-guide"') &&
    advancedMarkup.includes('bindtap="applyAdvancedMode"') &&
    !advancedMarkup.includes('bindtap="returnSimpleMode"') &&
    !advancedMarkup.includes("secondary-action") &&
    advancedStyles.includes(".reader-grid") &&
    advancedStyles.includes(".reader-guide-line") &&
    advancedStyles.includes(".spread-guide-line") &&
    advancedStyles.includes("max-width: 100%;") &&
    advancedStyles.includes("text-overflow: ellipsis;") &&
    advancedScript.includes("saveAdvancedReadingSelection") &&
    readingOptionsScript.includes('wx.setStorageSync(READING_MODE_STORAGE_KEY, "advanced")'),
  "All spreads and readers should live on the advanced subpage with one confirm action and guidance text."
);
assert(
  appManifest.includes('"pages/reading/reading"') &&
    fs.existsSync("miniprogram/pages/reading/reading.js") &&
    fs.existsSync("miniprogram/pages/reading/reading.wxml") &&
    fs.existsSync("miniprogram/pages/reading/reading.wxss") &&
    readingJson.includes('"navigationBarTitleText": "解读"') &&
    readingResultScript.includes("tarot_latest_reading_result") &&
    readingResultScript.includes("saveLatestReadingResult") &&
    pageScript.includes("saveLatestReadingResult") &&
    pageScript.includes("openReadingResult({ interpretation, question, notice })") &&
    pageScript.includes('url: "/pages/reading/reading"') &&
    pageScript.includes("createWheelFlightCaption(drawnCard)") &&
    pageMarkup.includes("{{wheel.flightCard.caption}}") &&
    pageMarkup.includes('class="message {{isInterpreting ? \'waiting\' : \'error\'}}"') &&
    !pageMarkup.includes('wx:if="{{interpretation}}" class="reading"') &&
    !pageMarkup.includes('class="reading-card"') &&
    pageStyles.includes(".message.waiting") &&
    !pageStyles.includes(".reading-card") &&
    readingScript.includes("loadLatestReadingResult") &&
    readingScript.includes("createDisplayCards") &&
    readingScript.includes('isReversed: orientation === "reversed"') &&
    readingScript.includes("wx.navigateBack") &&
    readingScript.includes('url: "/pages/index/index"') &&
    readingMarkup.includes('class="drawn-card-image {{item.isReversed ? \'reversed\' : \'\'}}"') &&
    readingMarkup.includes('wx:for="{{cards}}"') &&
    readingMarkup.includes('bindtap="returnHome"') &&
    readingMarkup.includes("{{interpretation.summary}}") &&
    readingStyles.includes(".drawn-card-image.reversed") &&
    readingStyles.includes("transform: rotate(180deg);") &&
    readingStyles.includes("grid-template-columns: 128rpx minmax(0, 1fr);") &&
    readingStyles.includes("max-width: 420rpx;"),
  "Finished readings should leave the draw page and render drawn cards on a dedicated reading page."
);
assert(
  pageMarkup.includes('class="question-dock"') &&
    pageMarkup.includes('class="mode-summary"') &&
    pageMarkup.includes('class="mode-link {{isInterpreting ? \'disabled\' : \'\'}}"') &&
    pageMarkup.includes('bindtap="goAdvancedMode"') &&
    pageMarkup.includes('class="question-input compact-question-input"') &&
    pageMarkup.includes('wx:if="{{selectedSpread.id === \'decisionPair\'}}"') &&
    pageMarkup.includes('class="decision-options-row"') &&
    pageMarkup.includes('class="question-input compact-question-input decision-option-input"') &&
    pageMarkup.includes('data-option="planA"') &&
    pageMarkup.includes('data-option="planB"') &&
    pageMarkup.includes('placeholder="{{ui.planAPlaceholder}}"') &&
    pageMarkup.includes('placeholder="{{ui.planBPlaceholder}}"') &&
    pageMarkup.includes('class="submit-button {{isInterpreting ? \'disabled\' : \'\'}}"') &&
    pageMarkup.includes('bindtap="drawCards"') &&
    pageMarkup.includes('class="deck-stage {{wheel.isOpen ? \'deck-stage-wheel\' : \'deck-stage-idle\'}}"') &&
    pageMarkup.includes('bindtap="tapDeckStage"') &&
    pageMarkup.includes("wheel-overlay-idle") &&
    pageMarkup.includes('wx:for="{{wheelCards}}"') &&
    pageMarkup.includes('style="{{item.slotStyle}}"') &&
    pageMarkup.includes('style="{{item.arcStyle}}"') &&
    !pageMarkup.includes("{{ui.deckPrompt}}") &&
    !pageMarkup.includes("idleDeckCards") &&
    !pageStyles.includes(".idle-deck-caption") &&
    !pageMarkup.includes('class="spread-control"') &&
    !pageMarkup.includes('class="reader-control"') &&
    !pageMarkup.includes('class="interpret-button"') &&
    !pageMarkup.includes('class="cards-section"') &&
    pageStyles.includes(".question-dock") &&
    pageStyles.includes(".compact-question-input") &&
    pageScript.includes("isReadingPending(page)") &&
    pageScript.includes("blockPendingInteraction()") &&
    pageMarkup.includes('disabled="{{isInterpreting}}"') &&
    pageMarkup.includes('class="motion-block"') &&
    pageMarkup.includes('catchtap="blockPendingInteraction"') &&
    pageStyles.includes(".motion-card-stack") &&
    pageStyles.includes("@keyframes motion-card-breathe") &&
    motionBlockStyle &&
    motionBlockStyle[0].includes("position: fixed;") &&
    motionBlockStyle[0].includes("z-index: 30;") &&
    pageStyles.includes(".decision-options-row") &&
    pageStyles.includes(".decision-option-input") &&
    pageStyles.includes("height: 104rpx;") &&
    pageStyles.includes(".mode-link:active") &&
    pageStyles.includes("background: #5b3fa3;") &&
    pageStyles.includes("box-shadow: 0 10rpx 22rpx rgba(91, 63, 163, 0.24);") &&
    pageStyles.includes("color: #fffaf0;") &&
    pageStyles.includes("grid-template-columns: minmax(0, 1fr) minmax(96rpx, 116rpx);") &&
    pageStyles.includes("grid-template-columns: repeat(2, minmax(0, 1fr));") &&
    pageStyles.includes(".submit-button") &&
    pageStyles.includes("max-width: 100%;") &&
    pageStyles.includes("width: auto;") &&
    pageStyles.includes("flex: 0 0 auto;") &&
    deckStageStyle &&
    deckStageStyle[0].includes("border: 2rpx solid #fffaf0;") &&
    deckStageStyle[0].includes("background: transparent;") &&
    deckStageStyle[0].includes("isolation: isolate;") &&
    !deckStageStyle[0].includes("box-shadow:") &&
    pageStyles.includes(".deck-stage-idle") &&
    deckStageWheelStyle &&
    deckStageWheelStyle[0].includes("border-color: #fffaf0;") &&
    !deckStageWheelStyle[0].includes("background:") &&
    !pageStyles.includes("border-style: dashed;") &&
    pageStyles.includes(".wheel-motion-idle .wheel-scroll") &&
    pageStyles.includes(".wheel-motion-idle .wheel-card-arc") &&
    pageScript.includes("tapDeckStage()") &&
    !pageStyles.includes(".idle-deck") &&
    !pageStyles.includes(".idle-card-shell") &&
    !pageStyles.includes("0 18rpx 28rpx rgba(38, 35, 31") &&
    !pageStyles.includes(".idle-card-1") &&
    !pageStyles.includes(".idle-card-2") &&
    !pageStyles.includes(".idle-card-3") &&
    !pageScript.includes("完整牌阵 / 读牌人") &&
    !pageScript.includes("完整模式"),
  "Home page should stay compact, show decision-pair option fields when needed, and avoid complete-mode labels."
);
const safetyNoteStyle = pageStyles.match(/\.note\s*{[^}]+}/);
assert(
  safetyNoteStyle &&
    safetyNoteStyle[0].includes("background: transparent;") &&
    safetyNoteStyle[0].includes("border: 0;") &&
    safetyNoteStyle[0].includes("color: #70685d;") &&
    pageStyles.includes(".provider-footer") &&
    pageStyles.includes("color: #8f887f;") &&
    pageMarkup.includes("{{ui.safetyNote}}") &&
    pageMarkup.includes("{{oauthStatus}}") &&
    pageMarkup.includes("{{buildLabel}}"),
  "Safety and provider text should be a quiet grey footer with no panel background or border."
);
assert(
  pageMarkup.includes('class="music-toggle {{music.enabled ? \'active\' : \'muted\'}} {{isInterpreting ? \'disabled\' : \'\'}}"') &&
    pageMarkup.includes('aria-label="{{music.enabled ? ui.musicOnLabel : ui.musicOffLabel}}"') &&
    pageMarkup.includes('class="language-toggle"') &&
    pageMarkup.includes('class="language-option {{language === item.id ? \'active\' : \'\'}} {{isInterpreting ? \'disabled\' : \'\'}}"') &&
    pageMarkup.includes("{{item.title}}") &&
    !pageMarkup.includes("{{item.label}}") &&
    pageMarkup.includes('bindtap="selectLanguage"') &&
    pageMarkup.includes('bindtap="toggleMusic"') &&
    pageMarkup.includes('role="button"') &&
    !pageMarkup.includes("<button\n        class=\"music-toggle") &&
    pageStyles.includes(".music-toggle") &&
    pageStyles.includes(".language-toggle") &&
    pageStyles.includes(".language-option.active") &&
    pageStyles.includes("width: 178rpx;") &&
    pageStyles.includes("flex: 0 0 178rpx;") &&
    pageStyles.includes("text-overflow: ellipsis;") &&
    pageStyles.includes("width: 48rpx;") &&
    pageStyles.includes("height: 48rpx;") &&
    pageStyles.includes("flex: 0 0 48rpx;") &&
    pageStyles.includes(".music-toggle.muted::before") &&
    pageScript.includes("REMOTE_ASSET_BASE_URL") &&
    pageScript.includes("languageOptions") &&
    pageScript.includes("selectLanguage(event)") &&
    readingOptionsScript.includes("createSpreads(language)") &&
    pageScript.includes("LOCAL_CARD_BACK_FALLBACK_PATH") &&
    pageScript.includes("LOCAL_MUSIC_TRACK_PATHS") &&
    pageScript.includes("createLocalFallbackAssetPaths") &&
    pageScript.includes("使用本地备用资源") &&
    pageScript.includes("loadRemoteAssets(this)") &&
    pageScript.includes("probeCloudRunAssets") &&
    pageScript.includes("probeDirectRemoteAssets") &&
    pageScript.includes('path: "/health"') &&
    pageScript.includes("activateRemoteAssets(page, directAssetPaths, loadToken)") &&
    pageScript.includes("正在确认高清资源") &&
    !pageScript.includes("loadPreloadedRemoteAssets") &&
    !pageScript.includes("loadAssetQueue") &&
    pageScript.includes("wx.getImageInfo") &&
    pageScript.includes("wx.downloadFile") &&
    pageScript.includes("MUSIC_TRACK_PATHS") &&
    pageScript.includes('intro: createRemoteAssetUrl("music", "bgm_intro.m4a")') &&
    pageScript.includes('introBar: createRemoteAssetUrl("music", "bgm_intro_bar.m4a")') &&
    pageScript.includes('createRemoteAssetUrl("music", "sfx_intro_rain.m4a")') &&
    pageScript.includes("wx.createInnerAudioContext") &&
    pageScript.includes("wx.setInnerAudioOption") &&
    pageScript.includes("audio.onCanplay") &&
    pageScript.includes("audio.onPlay") &&
    pageScript.includes("audio.onStop") &&
    pageScript.includes("safePlayMusic(page)") &&
    pageScript.includes("handleMusicError(page)") &&
    pageScript.includes("retryLocalMusicSource(page, trackKey)") &&
    pageScript.includes("handleIntroRainError(page)") &&
    pageScript.includes("startIntroRain(this)") &&
    pageScript.includes("resumeIntroRainOnHome(this)") &&
    pageScript.includes("const INTRO_RAIN_VOLUME = 0.34;") &&
    pageScript.includes("const INTRO_RAIN_FADE_MS = 1000;") &&
    pageScript.includes("dismissIntroRainForDraw(this)") &&
    pageScript.includes("fadeIntroRainVolume(page, audio, 0") &&
    pageScript.includes("fadeIntroRainVolume(page, audio, INTRO_RAIN_VOLUME)") &&
    pageScript.includes("audio.onEnded"),
  "Miniapp should expose a top music toggle, loop intro into intro_bar, recover local audio on remote errors, and gently fade intro rain around draw transitions."
);
assert(
  fs.existsSync("miniprogram/images/card-back-fallback.png") &&
    fs.existsSync("miniprogram/music/bgm_intro_fallback.m4a") &&
    fs.existsSync("miniprogram/music/bgm_intro_bar_fallback.m4a") &&
    fs.existsSync("miniprogram/music/sfx_intro_rain_fallback.m4a"),
  "Miniapp should bundle compact local fallback card and music assets while remote media is unavailable."
);
assert(
  pageScript.includes("问题：${safeQuestion || \"未填写\"}") &&
    pageScript.includes("方案 A：${planA || \"未填写\"}") &&
    pageScript.includes("方案 B：${planB || \"未填写\"}") &&
    advancedMarkup.includes('data-spread-id="{{item.id}}"') &&
    advancedMarkup.includes('data-reader-id="{{item.id}}"'),
  "Decision-pair prompt support should remain available for complete mode selections."
);

const promptSpread = {
  id: "oneCard",
  title: "单张牌",
  positions: ["指引"]
};
const promptDrawnCards = [
  {
    id: "the_fool-指引",
    position: "指引",
    orientation: "upright",
    keywords: ["开始", "冒险", "轻装"],
    card: {
      id: "the_fool",
      name: "愚者",
      arcana: "major",
      imageSrc: "cards/thefool.jpeg"
    }
  }
];
const promptRequest = createReadingRequest({
  question: "我该怎样开始这个项目？",
  spread: promptSpread,
  drawnCards: promptDrawnCards,
  readerProfile: "misty",
  decisionOptions: null,
  language: "zh"
});
const promptFallback = createFallbackReading({
  question: "我该怎样开始这个项目？",
  spread: promptSpread,
  drawnCards: promptDrawnCards,
  sourceLabel: "原型演示",
  readerProfile: "misty",
  language: "zh"
});
const slimReading = {
  schemaVersion: "tarot.reading.v1",
  sourceLabel: "HY · Misty",
  summary: "这张牌提示你先把第一步放小，再让方向慢慢显出来。",
  cards: [
    {
      id: "the_fool-指引",
      interpretation: "愚者正位落在指引位，像是在提醒你从轻一点的试探开始。它支持新的开端，但不要求你一次押上全部。"
    }
  ],
  overallMessage: "整体讯息是先行动一点点，再根据现实回声修正路线。",
  practicalReflection: "今天只写下一个可以在十分钟内开始的小动作。",
  journalQuestion: "我可以怎样让开始变得更轻？",
  caveat: "AI生成内容，仅供娱乐和自我反思。"
};

assert.doesNotThrow(() => {
  assertValidReading(slimReading, promptRequest);
}, "Slim AI readings should validate with only card id and interpretation.");

const normalizedSlimReading = normalizeReading(slimReading, promptFallback, "zh");

assert.deepStrictEqual(
  Object.keys(readingJsonSchema().schema.properties.cards.items.properties),
  ["id", "interpretation"],
  "JSON schema should only ask AI cards for id and interpretation."
);
assert.deepStrictEqual(
  readingJsonSchema().schema.properties.cards.items.required,
  ["id", "interpretation"],
  "AI card schema should not require copied metadata."
);
assert.strictEqual(normalizedSlimReading.cards[0].name, "愚者", "Normalized slim card should hydrate card name from fallback metadata.");
assert.strictEqual(normalizedSlimReading.cards[0].position, "指引", "Normalized slim card should hydrate position from fallback metadata.");
assert.strictEqual(normalizedSlimReading.cards[0].orientationText, "正位", "Normalized slim card should hydrate orientation text.");
assert.deepStrictEqual(normalizedSlimReading.cards[0].keywords, ["开始", "冒险", "轻装"], "Normalized slim card should hydrate keywords.");

const promptMessages = buildReadingMessages({
  sourceLabel: "HY",
  readingRequest: promptRequest
});
const serializedPromptPayload = JSON.parse(promptMessages[1].content.slice(promptMessages[1].content.indexOf("{")));

assert(
  promptMessages[0].content.includes("cards 数组每项只输出 id 与 interpretation") &&
    promptMessages[0].content.includes("summary 只给主线、状态或提醒") &&
    fs.existsSync("miniprogram/prompts/system-prompt.js") &&
    fs.existsSync("miniprogram/prompts/conditional-rules.js"),
  "Prompt pipeline should centralize output contract and resolved classifier guidance under miniprogram/prompts."
);
assert(
  !Object.prototype.hasOwnProperty.call(serializedPromptPayload, "questionFocus") &&
    !Object.prototype.hasOwnProperty.call(serializedPromptPayload, "questionScale") &&
    !Object.prototype.hasOwnProperty.call(serializedPromptPayload, "answerGuidance") &&
    serializedPromptPayload.readerProfile &&
    !Object.prototype.hasOwnProperty.call(serializedPromptPayload.readerProfile, "responseShape") &&
    serializedPromptPayload.drawnCards[0].keywordsText === "开始、冒险、轻装",
  "Prompt user payload should stay slim while preserving card reading metadata."
);

assert(
  pageMarkup.includes('class="page {{wheel.isOpen ? \'page-wheel-active\' : \'\'}}"') &&
    pageMarkup.includes('class="wheel-aperture-ring"') &&
    pageMarkup.includes("{{ui.wheelDrawPrefix}}{{wheel.currentDrawNumber}}{{ui.wheelDrawMiddle}}{{wheel.requiredCount}}{{ui.wheelDrawSuffix}}{{wheel.currentDrawPosition}}") &&
    pageMarkup.includes('class="wheel-track"') &&
    pageMarkup.includes("wheel-motion-{{wheel.motion}}") &&
    pageMarkup.includes('class="wheel-flight-card"') &&
    pageMarkup.includes('class="wheel-flight-face wheel-flight-front"') &&
    pageMarkup.includes('class="wheel-card-arc" style="{{item.arcStyle}}"') &&
    pageMarkup.includes('class="wheel-card-back" src="{{wheel.cardBackSrc}}" mode="aspectFill"') &&
    pageStyles.includes(".page-wheel-active::before") &&
    pageStyles.includes("transition: opacity 820ms") &&
    pageStyles.includes(".wheel-overlay") &&
    pageStyles.includes("position: relative;") &&
    pageStyles.includes("background: transparent;") &&
    pageStyles.includes("animation: none;") &&
    wheelCopyStyle &&
    wheelCopyStyle[0].includes("background: transparent;") &&
    wheelCopyStyle[0].includes("pointer-events: none;") &&
    !pageStyles.includes(".wheel-overlay::before") &&
    wheelStageStyle &&
    wheelStageStyle[0].includes("top: 80rpx;") &&
    wheelStageStyle[0].includes("bottom: 0;") &&
    wheelStageStyle[0].includes("overflow: hidden;") &&
    !wheelStageStyle[0].includes("bottom: 92rpx;") &&
    pageMarkup.includes('bindtap="onWheelCardTap"') &&
    !pageMarkup.includes("main-flow-wheel-open"),
  "Wheel should sit under the question dock while the page background gently blooms behind existing text."
);
assert(
    pageMarkup.includes('scroll-with-animation="{{wheel.scrollWithAnimation}}"') &&
    pageMarkup.includes('scroll-into-view="{{wheel.scrollIntoView}}"') &&
    pageMarkup.includes('id="wheel-scroll-home"') &&
    pageMarkup.includes('id="wheel-slot-{{index}}"') &&
    pageMarkup.includes('bounces="{{false}}"') &&
    pageMarkup.includes('fast-deceleration="{{false}}"') &&
    !pageMarkup.includes("scroll-left=") &&
    pageMarkup.includes('enhanced="{{true}}"') &&
    pageScript.includes("WHEEL_ARC_TAIL_DISTANCE") &&
    wheelStartSpacerStyle &&
    wheelEndSpacerStyle &&
    wheelCardSlotStyle &&
    wheelEndSpacerStyle[0].includes("width: 405rpx;") &&
    wheelStrideRpx === 32 &&
    wheelMaxScrollRpx >= wheelLastSlotScrollRpx,
  "Arc motion should use free native inertia, clamp the final scroll range, and curve tail cards out of view."
);
assert(
  pageStyles.includes(".wheel-motion-spreading .wheel-card-arc") &&
    pageStyles.includes(".wheel-motion-closing-spin .wheel-card-arc") &&
    pageStyles.includes(".wheel-motion-closing .wheel-card-arc") &&
    pageStyles.includes(".wheel-motion-closing-ring .wheel-aperture-ring") &&
    pageStyles.includes("@keyframes wheel-aperture-ring-open") &&
    pageStyles.includes("@keyframes wheel-content-exit") &&
    pageStyles.includes("animation: wheel-aperture-ring-open 1120ms") &&
    !pageStyles.includes(".wheel-motion-closing-spin .wheel-aperture-ring,\n.wheel-motion-closing .wheel-aperture-ring {\n  animation: wheel-aperture-ring-close") &&
    pageStyles.includes("transform 1120ms cubic-bezier(0.18, 0.82, 0.22, 1)") &&
    !pageStyles.includes(".wheel-motion-closing .wheel-stage") &&
    pageMarkup.includes('class="wheel-flight-card-draw"') &&
    wheelFlightCardStyle &&
    wheelFlightCardStyle[0].includes("top: 257rpx;") &&
    wheelFlightCardStyle[0].includes("left: 281rpx;") &&
    wheelFlightCardStyle[0].includes("width: 188rpx;") &&
    wheelFlightCardStyle[0].includes("height: 330rpx;") &&
    pageStyles.includes("@keyframes wheel-card-pop-move") &&
    pageStyles.includes("@keyframes wheel-card-draw-back-flip") &&
    pageStyles.includes("@keyframes wheel-card-draw-front-flip") &&
    pageStyles.includes("animation: wheel-card-pop-move 820ms") &&
    pageStyles.includes("animation: wheel-card-draw-front-flip 300ms") &&
    pageStyles.includes("820ms forwards") &&
    pageStyles.includes("translate(0, -26rpx) rotate(0deg) scale(1.06)") &&
    pageStyles.includes("translate(-82rpx, -58rpx) rotate(-3deg) scale(1.08)") &&
    pageStyles.includes("translate(-258rpx, -86rpx) rotate(-5deg) scale(1.00)") &&
    pageStyles.includes("rotateX(360deg)") &&
    !pageStyles.includes("translate(-172rpx, -34rpx)") &&
    !pageStyles.includes("translate(245rpx, 360rpx)") &&
    !pageStyles.includes("translate(215rpx, 316rpx)") &&
    !pageStyles.includes("scale(0.78)") &&
    !pageStyles.includes("@keyframes wheel-card-tangent-pull") &&
    !pageStyles.includes("wheel-card-clockwise-spin") &&
    !pageStyles.includes("rotate(720deg)") &&
    !pageStyles.includes("rotateY(180deg)"),
  "Drawn-card flight should use a two-step pop-and-move followed by a delayed flip reveal."
);

context.data.wheelCards[context.data.wheel.activeIndex] = Object.assign({}, context.data.wheelCards[context.data.wheel.activeIndex], {
  orientation: "reversed",
  orientationLabel: "逆位"
});
const totalDraws = context.data.wheel.requiredCount;

for (let drawIndex = 0; drawIndex < totalDraws; drawIndex += 1) {
  const activeIndex = context.data.wheel.activeIndex;
  const activeSlot = context.data.wheelCards[activeIndex];

  pageDefinition.onWheelCardTap.call(context, {
    currentTarget: {
      dataset: {
        index: activeIndex
      }
    }
  });
  assert.strictEqual(context.data.wheel.selectedIndex, activeIndex, "First tap should pop the active card.");
  assert.strictEqual(context.data.drawnCards.length, drawIndex, "First tap should not draw yet.");

  pageDefinition.onWheelCardTap.call(context, {
    currentTarget: {
      dataset: {
        index: activeIndex
      }
    }
  });
  assert.strictEqual(context.data.drawnCards.length, drawIndex + 1, "Second tap should confirm the card.");
  assert.strictEqual(context.data.wheel.phase, "drawing", "Confirmed card should fly out without freezing the wheel.");
  assert.strictEqual(context.data.wheel.selectedIndex, -1, "Drawn card should leave the active slot for the overlay animation.");
  assert.strictEqual(
    context.data.wheel.currentDrawPosition,
    context.data.selectedSpread.positions[drawIndex],
    "Draw-flight caption should name the card position being drawn."
  );
  assert(context.data.wheel.flightCard, "Confirmed card should be represented by a flight overlay.");
  assert.strictEqual(context.data.wheel.flightCard.card.id, activeSlot.cardId, "Flight overlay should reveal the selected card face.");
  assert.strictEqual(context.data.wheel.flightCard.orientation, activeSlot.orientation, "Flight overlay should keep the selected card orientation.");
  if (activeSlot.orientation === "reversed") {
    assert.strictEqual(
      context.data.wheel.flightCard.caption,
      `${context.data.selectedSpread.positions[drawIndex]} · ${activeSlot.name} · ${activeSlot.orientationLabel}`,
      "Draw-flight caption should explicitly name reversed cards."
    );
  }
  assert.strictEqual(
    context.data.drawnCards[drawIndex].card.id,
    activeSlot.cardId,
    "Confirmed card should preserve the preassigned wheel slot face."
  );
  assert.strictEqual(context.data.wheelCards[activeIndex].drawn, true, "Confirmed wheel slot should be marked drawn.");

  if (drawIndex === 0) {
    pageDefinition.onWheelNativeScroll.call(context, {
      detail: {
        scrollLeft: WHEEL_DRAWING_SCROLL_LEFT
      }
    });
    assert.strictEqual(context.data.wheel.phase, "drawing", "Wheel should remain in drawing phase while it scrolls.");
    assert.strictEqual(context.data.wheel.flightCard.card.id, activeSlot.cardId, "Flying card should stay visible while the wheel spins.");
    assert.notStrictEqual(context.data.wheel.activeIndex, activeIndex, "Native scroll should still update the highlighted wheel card during draw flight.");
  }

  if (drawIndex < totalDraws - 1) {
    runNextTimerByDelay(1120);
    assert.strictEqual(context.data.wheel.motion, "arc", "Wheel should remain interactive between selections.");
    assert.strictEqual(context.data.wheel.phase, "choosing", "Wheel should return to choosing after a non-final draw flight.");
    assert.strictEqual(
      context.data.wheel.currentDrawPosition,
      context.data.selectedSpread.positions[drawIndex + 1],
      "Wheel caption should advance to the next spread position after each draw."
    );
    assert.strictEqual(context.data.wheel.flightCard, null, "Draw flight overlay should clear after the card reaches the top-left corner.");
  } else {
    runNextTimerByDelay(1120);
    assert.strictEqual(context.data.wheel.isOpen, true, "Final draw flight should keep the wheel visible while it closes.");
    assert.strictEqual(context.data.wheel.motion, "closing-spin", "Final draw flight should spin the wheel right before piling back.");
    assert.strictEqual(context.data.wheel.phase, "closing", "Wheel should enter closing phase before interpretation.");
    assert.strictEqual(context._interpreted, false, "Interpretation should wait for the pile-back animation.");
    assert(
        context.data.wheel.activeIndex === 0 &&
        context.data.wheel.scrollLeft === 0 &&
        context.data.wheel.scrollIntoView === "wheel-scroll-home" &&
        context.data.wheel.scrollWithAnimation === true &&
        context._wheelScrollLeft === 0 &&
        context.data.wheelCards[0].arcStyle.includes("translate(0rpx, 32rpx)") &&
        context.data.wheelCards[1].arcStyle.includes("translate(43rpx, -36rpx)") &&
        context.data.wheelCards[1].arcStyle.includes("rotate(8.1deg)"),
      "Close should first drive native scroll right until the leftmost card is centered."
    );
    runNextTimerByDelay(280);
    assert.strictEqual(context.data.wheel.motion, "closing", "Right-side cards should then pile back into the idle deck shape.");
    assert.strictEqual(context.data.wheel.activeIndex, 0, "Pile-back should return to the home deck anchor.");
    assert.strictEqual(context.data.wheel.scrollIntoView, "wheel-scroll-home", "Pile-back should keep the native scroll anchored at the leftmost card.");
    assert.strictEqual(context.data.wheel.scrollWithAnimation, false, "Pile-back should stop native scroll animation before collapsing the right side.");
    assert(
      context.data.wheelCards[0].arcStyle.includes("translate(0rpx, 32rpx)") &&
        context.data.wheelCards[77].arcStyle.includes("translate(-2440rpx, -8rpx)") &&
        context.data.wheelCards[77].arcStyle.includes("rotate(4.8deg)"),
      "Pile-back animation should collapse the right side into the tight idle deck instead of disappearing."
    );
    runNextTimerByDelay(660);
    assert.strictEqual(context.data.wheel.isOpen, true, "Wheel should stay open while the aperture closes after pile-back.");
    assert.strictEqual(context.data.wheel.motion, "closing-ring", "Aperture close should wait until after the cards have piled back.");
    assert.strictEqual(context._interpreted, false, "Interpretation should still wait for the aperture close.");
    assert(
      context.data.wheelCards[0].arcStyle.includes("translate(0rpx, 32rpx)") &&
        context.data.wheelCards[77].arcStyle.includes("translate(-2440rpx, -8rpx)") &&
        context.data.wheelCards.every((slot) => slot.drawn === false),
      "Closing aperture should run over the restored idle deck rather than over unsorted drawn slots."
    );
    runNextTimerByDelay(660);
  }
}

assert.strictEqual(context.data.wheel.isOpen, false, "Wheel should close after the spread is complete.");
assert.strictEqual(context._interpreted, true, "Final draw should automatically start interpretation.");
assert.strictEqual(context.data.wheel.cardBackSrc, `${REMOTE_ASSET_BASE_URL}/cards/card-back.png`, "Idle deck should keep the loaded card back after the wheel closes.");
assert(
  context.data.wheelCards.map((slot) => slot.id).join("|") === idleWheelCardIds &&
    context.data.wheelCards[77].arcStyle.includes("translate(-2440rpx, -8rpx)") &&
    context.data.wheelCards[77].slotStyle.includes("z-index: 1"),
  "Closed wheel should restore the same tight idle wheel deck."
);
const rainContextCountBeforeReturn = audioContexts.length;

assert.strictEqual(context._rainDismissed, true, "Completed draw should keep rain dismissed while the reading page is active.");
pageDefinition.onShow.call(context);
assert.strictEqual(audioContexts.length, rainContextCountBeforeReturn + 1, "Returning from the reading page should create a fresh intro rain session.");
activeRainAudio = audioContexts[audioContexts.length - 1];
assert.strictEqual(context._rainDismissed, false, "Returning to the closed home page should allow intro rain to resume.");
assert.strictEqual(activeRainAudio.volume, 0, "Resumed intro rain should restart silently before fading in.");
assert(activeRainAudio.playCount >= 1, "Returning from the reading page should restart the intro rain bed.");
assert.strictEqual(runAllTimersByDelay(100), 10, "Returning from the reading page should fade rain in over about one second.");
assert.strictEqual(activeRainAudio.volume, 0.34, "Resumed intro rain should settle at the doubled ambient volume.");

pageDefinition.onUnload.call(context);
assert.strictEqual(activeMusicAudio.destroyed, true, "Page unload should destroy the active background music context.");
assert.strictEqual(activeRainAudio.destroyed, true, "Page unload should destroy the active intro rain context.");

global.setTimeout = originalSetTimeout;
global.clearTimeout = originalClearTimeout;

assertCardBackHasTransparentCorners().then(() => {
  console.log("Wheel state test passed.");
}).catch((error) => {
  console.error(error);
  process.exit(1);
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function setDataPath(target, path, value) {
  const segments = path.split(".");
  let node = target;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];

    if (!node[segment] || typeof node[segment] !== "object") {
      node[segment] = {};
    }

    node = node[segment];
  }

  node[segments[segments.length - 1]] = value;
}

function runNextTimerByDelay(delay) {
  const timerIndex = pendingTimers.findIndex((timer) => timer.delay === delay);

  assert(timerIndex >= 0, `Expected a pending timer with delay ${delay}.`);

  const [timer] = pendingTimers.splice(timerIndex, 1);
  timer.callback();
}

function runAllTimersByDelay(delay, limit = 20) {
  let count = 0;

  while (pendingTimers.some((timer) => timer.delay === delay) && count < limit) {
    runNextTimerByDelay(delay);
    count += 1;
  }

  return count;
}

function extractRpxValue(styleMatch, property) {
  assert(styleMatch, `Missing style block while reading ${property}.`);

  const pattern = new RegExp(`${property}:\\s*(-?\\d+)rpx;`);
  const match = styleMatch[0].match(pattern);

  assert(match, `Missing ${property} rpx declaration.`);
  return Number(match[1]);
}

function createMockAudioContext() {
  const handlers = {};

  return {
    autoplay: null,
    destroyed: false,
    loop: null,
    obeyMuteSwitch: null,
    playCount: 0,
    src: "",
    stopCount: 0,
    volume: null,
    destroy() {
      this.destroyed = true;
    },
    onCanplay(callback) {
      handlers.canplay = callback;
    },
    onEnded(callback) {
      handlers.ended = callback;
    },
    onError(callback) {
      handlers.error = callback;
    },
    onPause(callback) {
      handlers.pause = callback;
    },
    onPlay(callback) {
      handlers.play = callback;
    },
    onStop(callback) {
      handlers.stop = callback;
    },
    play() {
      this.playCount += 1;
      if (handlers.play) {
        handlers.play();
      }
    },
    stop() {
      this.stopCount += 1;
      if (handlers.stop) {
        handlers.stop();
      }
    },
    triggerCanplay() {
      if (handlers.canplay) {
        handlers.canplay();
      }
    },
    triggerEnded() {
      if (handlers.ended) {
        handlers.ended();
      }
    },
    triggerPlay() {
      if (handlers.play) {
        handlers.play();
      }
    },
    triggerError() {
      if (handlers.error) {
        handlers.error({
          errMsg: "mock audio error"
        });
      }
    }
  };
}

async function assertCardBackHasTransparentCorners() {
  const { data, info } = await sharp("images/card-back-source.png")
    .ensureAlpha()
    .raw()
    .toBuffer({
      resolveWithObject: true
    });
  const cornerIndexes = [
    0,
    info.width - 1,
    (info.height - 1) * info.width,
    info.width * info.height - 1
  ];
  const alphas = cornerIndexes.map((pixelIndex) => data[pixelIndex * info.channels + 3]);

  assert(
    alphas.every((alpha) => alpha === 0),
    `Card back should have transparent corners, got alpha values ${alphas.join(", ")}.`
  );
}
