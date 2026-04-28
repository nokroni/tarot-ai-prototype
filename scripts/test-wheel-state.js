const assert = require("assert");
const fs = require("fs");
const sharp = require("sharp");

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
assert.strictEqual(pageDefinition.data.spreads.length, 4, "Spread picker should include the new spread options.");
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
  interpretReading() {
    this._interpreted = true;
  }
};

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
assert.strictEqual(audioContexts[1].volume, 0.17, "Intro rain should sit gently under the main music.");
assert.strictEqual(audioContexts[1].playCount, 1, "Intro rain should start once the page is ready.");

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
assert.strictEqual(context.data.selectedSpread.title, "Three Cards", "Selected spread title should localize to English.");
assert.deepStrictEqual(context.data.selectedSpread.positions, ["Situation", "Challenge", "Advice"], "Selected spread positions should localize to English.");
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

pageDefinition.drawCards.call(context);

assert.strictEqual(context.data.wheel.isOpen, true, "Wheel should open when drawing starts.");
assert.strictEqual(context.data.buildLabel, "0.8.0 双语版本", "Build label should identify the 0.8.0 bilingual build.");
assert.strictEqual(context.data.wheel.requiredCount, 3, "Three-card spread should require three selections.");
assert.strictEqual(context.data.wheel.scrollLeft, 0, "Wheel should start at the first preassigned slot.");
assert.strictEqual(context.data.wheel.activeIndex, 0, "Wheel should start with the first slot highlighted.");
assert.strictEqual(context.data.wheel.motion, "stack", "Wheel should open as a stacked deck before spreading.");
assert.strictEqual(context.data.wheel.currentDrawPosition, "现状", "Wheel caption should include the first spread position.");
assert.strictEqual(context._rainDismissed, true, "Starting a draw should dismiss the intro rain bed.");
assert(pendingTimers.some((timer) => timer.delay === 120), "Starting a draw should schedule a gentle rain fade.");
const initialRainVolume = activeRainAudio.volume;
runNextTimerByDelay(120);
assert(activeRainAudio.volume < initialRainVolume, "Intro rain fade should step the volume down before stopping.");
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
    context.data.wheelCards[7].arcStyle.includes("translate(-224rpx, 32rpx)") &&
    context.data.wheelCards[7].arcStyle.includes("rotate(0.0deg)"),
  "Wheel cards should initially cancel native slot spacing into a stack."
);
assert(pendingTimers.some((timer) => timer.delay === 680), "Wheel should linger in the initial stack twice as long before spreading.");

runNextTimerByDelay(680);

assert.strictEqual(context.data.wheel.motion, "spreading", "Wheel should animate from the stack into the arc.");
assert(pendingTimers.some((timer) => timer.delay === 1120), "Wheel spread should take twice as long before the rail becomes interactive.");
assert(
  context.data.wheelCards[0].arcStyle.includes("translate(0rpx, 32rpx)") &&
    context.data.wheelCards[7].arcStyle.includes("translate(395rpx, -363rpx)") &&
    context.data.wheelCards[7].arcStyle.includes("rotate(57.0deg)"),
  "Spreading cards should target the exposed upper-left 60-degree circle arc."
);

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
const drawnCardFaceStyle = pageStyles.match(/\.card-face\s*{[^}]+}/);

assert(drawnCardFaceStyle, "Drawn card face style should exist.");
assert(
  pageStyles.includes("grid-template-columns: repeat(3, minmax(0, 1fr));"),
  "Three-card drawn spread should render horizontally."
);
assert(
  pageStyles.includes("width: 172rpx;") &&
    pageStyles.includes("height: 300rpx;") &&
    pageStyles.includes(".cards-grid.pair .card-face") &&
    pageStyles.includes("width: 218rpx;") &&
    pageStyles.includes("height: 380rpx;") &&
    drawnCardFaceStyle[0].includes("background: transparent;") &&
    !drawnCardFaceStyle[0].includes("background: #171311;"),
  "Displayed card images should match tarot art ratio without a black aspectFit background."
);
assert(
  pageMarkup.includes('class="spread-insight"') &&
    pageMarkup.includes("{{selectedSpread.insight}}") &&
    pageStyles.includes(".spread-insight") &&
    pageStyles.includes("color: #8f887f;") &&
    !pageStyles.includes(".spread-insight {\\n  border"),
  "Selected spread quote should render as small grey insight text without a box."
);
assert(
  pageMarkup.includes('class="reader-control"') &&
    pageMarkup.includes('class="reader-option {{selectedReaderId === item.id ? \'active\' : \'\'}}"') &&
    pageMarkup.includes('bindtap="selectReader"') &&
    pageMarkup.includes('class="reader-name"') &&
    !pageMarkup.includes("reader-subtitle") &&
    !pageMarkup.includes("source-pill") &&
    pageStyles.includes(".reader-control") &&
    pageStyles.includes("grid-template-columns: repeat(3, minmax(0, 1fr));") &&
    pageStyles.includes(".reader-option.active") &&
    !pageStyles.includes(".reader-subtitle") &&
    !pageStyles.includes(".source-pill") &&
    pageStyles.includes(".reader-option::after") &&
    pageStyles.includes("max-width: 100%;") &&
    pageStyles.includes("overflow: hidden;"),
  "Reader selector should render three name-only readers in one row without active button overflow or duplicate source pills."
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
  pageMarkup.includes('class="music-toggle {{music.enabled ? \'active\' : \'muted\'}}"') &&
    pageMarkup.includes('aria-label="{{music.enabled ? ui.musicOnLabel : ui.musicOffLabel}}"') &&
    pageMarkup.includes('class="language-toggle"') &&
    pageMarkup.includes('class="language-option {{language === item.id ? \'active\' : \'\'}}"') &&
    pageMarkup.includes("{{item.title}}") &&
    !pageMarkup.includes("{{item.label}}") &&
    pageMarkup.includes('bindtap="selectLanguage"') &&
    pageMarkup.includes('class="resource-badge"') &&
    pageMarkup.includes("{{assets.resourceLabel}}") &&
    pageMarkup.includes('bindtap="toggleMusic"') &&
    pageMarkup.includes('role="button"') &&
    !pageMarkup.includes("<button\n        class=\"music-toggle") &&
    pageStyles.includes(".music-toggle") &&
    pageStyles.includes(".language-toggle") &&
    pageStyles.includes(".language-option.active") &&
    pageStyles.includes("width: 178rpx;") &&
    pageStyles.includes("flex: 0 0 178rpx;") &&
    pageStyles.includes("text-overflow: ellipsis;") &&
    pageStyles.includes(".resource-badge") &&
    pageStyles.includes("width: 48rpx;") &&
    pageStyles.includes("height: 48rpx;") &&
    pageStyles.includes("flex: 0 0 48rpx;") &&
    pageStyles.includes(".music-toggle.muted::before") &&
    pageScript.includes("REMOTE_ASSET_BASE_URL") &&
    pageScript.includes("languageOptions") &&
    pageScript.includes("selectLanguage(event)") &&
    pageScript.includes("createSpreads(language)") &&
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
    pageScript.includes("fadeIntroRain(this)") &&
    pageScript.includes("audio.onEnded"),
  "Miniapp should expose a top music toggle, loop intro into intro_bar, recover local audio on remote errors, and fade intro rain on draw."
);
assert(
  fs.existsSync("miniprogram/images/card-back-fallback.png") &&
    fs.existsSync("miniprogram/music/bgm_intro_fallback.m4a") &&
    fs.existsSync("miniprogram/music/bgm_intro_bar_fallback.m4a") &&
    fs.existsSync("miniprogram/music/sfx_intro_rain_fallback.m4a"),
  "Miniapp should bundle compact local fallback card and music assets while remote media is unavailable."
);
assert(
  pageMarkup.includes("selectedSpreadId === 'decisionPair'") &&
    pageMarkup.includes('class="decision-inputs"') &&
    pageMarkup.includes("Question") &&
    pageMarkup.includes('value="{{question}}"') &&
    pageMarkup.includes('bindinput="onQuestionInput"') &&
    pageMarkup.includes('class="question-input decision-option-input decision-question-input"') &&
    pageMarkup.includes("Plan A") &&
    pageMarkup.includes("Plan B") &&
    pageMarkup.includes('data-option="planA"') &&
    pageMarkup.includes('data-option="planB"') &&
    pageMarkup.includes('bindinput="onDecisionOptionInput"') &&
    pageStyles.includes(".decision-question-card") &&
    pageStyles.includes(".question-input.decision-question-input") &&
    pageStyles.includes(".decision-input-card") &&
    pageStyles.includes(".question-input.decision-option-input") &&
    pageScript.includes("问题：${safeQuestion || \"未填写\"}") &&
    pageScript.includes("方案 A：${planA || \"未填写\"}") &&
    pageScript.includes("方案 B：${planB || \"未填写\"}"),
  "Decision-pair spread should render separate Question, Plan A, and Plan B dialogue boxes and send all three to the model."
);
assert(
  pageStyles.includes(".spread-control") &&
    pageStyles.includes("grid-template-columns: repeat(2, minmax(0, 1fr));") &&
    pageStyles.includes(".spread-option::after") &&
    pageStyles.includes("box-sizing: border-box;") &&
    pageMarkup.includes("drawnCards.length === 2 ? 'pair' : ''") &&
    pageStyles.includes(".cards-grid.pair"),
  "Four spread choices and two-card results should use stable two-column layouts without selection overflow."
);
assert(
    pageMarkup.includes("main-flow {{wheel.isOpen ? 'main-flow-wheel-open' : ''}}") &&
    pageMarkup.includes('class="wheel-aperture-ring"') &&
    pageMarkup.includes("{{ui.wheelDrawPrefix}}{{wheel.currentDrawNumber}}{{ui.wheelDrawMiddle}}{{wheel.requiredCount}}{{ui.wheelDrawSuffix}}{{wheel.currentDrawPosition}}") &&
    pageMarkup.includes('class="wheel-track"') &&
    pageMarkup.includes("wheel-motion-{{wheel.motion}}") &&
    pageMarkup.includes('class="wheel-flight-card"') &&
    pageMarkup.includes('class="wheel-flight-face wheel-flight-front"') &&
    pageMarkup.includes('class="wheel-card-arc" style="{{item.arcStyle}}"') &&
    pageMarkup.includes('class="wheel-card-back" src="{{wheel.cardBackSrc}}" mode="aspectFill"') &&
    pageStyles.includes("overflow: hidden;") &&
    pageMarkup.includes('bindtap="onWheelCardTap"'),
  "Visible cards should live inside the native scroll layer while the drawn card animates in its own overlay without back-image highlight gaps."
);
assert(
  pageMarkup.includes('scroll-with-animation="{{false}}"') &&
    pageMarkup.includes('fast-deceleration="{{false}}"') &&
    !pageMarkup.includes("scroll-left=") &&
    pageMarkup.includes('enhanced="{{true}}"'),
  "Arc motion should use uncontrolled native inertia without animated snap or separate hidden gesture layers."
);
assert(
  pageStyles.includes(".wheel-motion-spreading .wheel-card-arc") &&
    pageStyles.includes(".wheel-motion-closing .wheel-card-arc") &&
    pageStyles.includes("@keyframes wheel-aperture-open") &&
    pageStyles.includes("@keyframes wheel-aperture-close") &&
    pageStyles.includes("@keyframes wheel-aperture-ring-open") &&
    pageStyles.includes("@keyframes wheel-content-exit") &&
    pageStyles.includes("animation: wheel-aperture-open 920ms") &&
    pageStyles.includes("animation: wheel-aperture-ring-open 1120ms") &&
    pageStyles.includes("transform 1120ms cubic-bezier(0.18, 0.82, 0.22, 1)") &&
    pageStyles.includes("clip-path: circle(0% at 50% 56%)") &&
    pageStyles.includes("clip-path: circle(142% at 50% 56%)") &&
    pageStyles.includes(".main-flow-wheel-open") &&
    pageMarkup.includes('class="wheel-flight-card-draw"') &&
    pageStyles.includes("@keyframes wheel-card-pop-move") &&
    pageStyles.includes("@keyframes wheel-card-draw-back-flip") &&
    pageStyles.includes("@keyframes wheel-card-draw-front-flip") &&
    pageStyles.includes("animation: wheel-card-pop-move 820ms") &&
    pageStyles.includes("animation: wheel-card-draw-front-flip 300ms") &&
    pageStyles.includes("820ms forwards") &&
    pageStyles.includes("translate(215rpx, 316rpx) rotate(-4deg) scale(1.14)") &&
    pageStyles.includes("translate(0, 0) rotate(0deg) scale(0.78)") &&
    pageStyles.includes("rotateX(360deg)") &&
    !pageStyles.includes("@keyframes wheel-card-tangent-pull") &&
    !pageStyles.includes("wheel-card-clockwise-spin") &&
    !pageStyles.includes("rotate(720deg)") &&
    !pageStyles.includes("rotateY(180deg)"),
  "Drawn-card flight should use a two-step pop-and-move followed by a delayed flip reveal."
);

for (let drawIndex = 0; drawIndex < 3; drawIndex += 1) {
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

  if (drawIndex < 2) {
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
    assert.strictEqual(context.data.wheel.isOpen, true, "Final draw flight should pile cards back before closing.");
    assert.strictEqual(context.data.wheel.motion, "closing", "Final draw flight should trigger the pile-back motion.");
    assert.strictEqual(context.data.wheel.phase, "closing", "Wheel should enter closing phase before interpretation.");
    assert.strictEqual(context._interpreted, false, "Interpretation should wait for the pile-back animation.");
    assert(
      context.data.wheelCards[activeIndex].arcStyle.includes("translate(0rpx, 32rpx)") &&
        context.data.wheelCards[activeIndex + 1].arcStyle.includes("translate(-32rpx, 32rpx)"),
      "Pile-back animation should collapse neighboring cards into the selected stack position."
    );
    runNextTimerByDelay(660);
  }
}

assert.strictEqual(context.data.wheel.isOpen, false, "Wheel should close after the spread is complete.");
assert.strictEqual(context._interpreted, true, "Final draw should automatically start interpretation.");

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
