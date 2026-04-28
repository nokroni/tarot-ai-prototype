const appConfig = require("../../config");
const {
  createCloudBaseReading,
  hasCloudBaseAI,
  resolveCloudAISourceLabel
} = require("../../services/cloudbase-ai");
const {
  assertValidReading,
  createFallbackReading,
  createReadingRequest,
  isRetryableReadingFormatError,
  normalizeReading,
  readingJsonSchema
} = require("../../services/reading-schema");
const {
  clearReadingBackendSession,
  connectReadingBackend,
  hasUsableOAuth,
  loadReadingBackendSession
} = require("../../services/oauth");
const {
  callCloudRun,
  hasCloudRun
} = require("../../services/cloudrun");
const {
  getReaderProfileOption,
  readerProfileOptions
} = require("../../services/reader-profiles");
const {
  DEFAULT_LANGUAGE_CODE,
  formatOrientationText,
  languageOptions,
  normalizeLanguageCode
} = require("../../services/language");
const {
  SIMPLE_READER_ID,
  SIMPLE_SPREAD_ID,
  createSpreads,
  getSpreadById,
  getStoredReadingMode
} = require("../../services/reading-options");
const { saveLatestReadingResult } = require("../../services/reading-result");

const LANGUAGE_STORAGE_KEY = "tarot_language";
const uiCopy = {
  zh: {
    assetGateTitle: "正在铺开牌桌",
    assetGateLoading: "正在加载牌面与音乐",
    assetRetry: "重新加载",
    title: "塔罗牌",
    modeChange: "所有牌阵 / 读牌人",
    modeSimple: "单牌 · Misty",
    musicOnLabel: "关闭音乐",
    musicOffLabel: "开启音乐",
    questionPlaceholder: "想问 Misty 什么呢",
    planAPlaceholder: "方案 A",
    planBPlaceholder: "方案 B",
    submitButton: "提交",
    safetyNote: "AI生成内容，仅供娱乐和自我反思，不构成专业建议或确定预言。牌面由轮盘预先洗牌分配，选择后再进行解读。",
    wheelDrawPrefix: "抽取第",
    wheelDrawMiddle: "/",
    wheelDrawSuffix: "张：",
    wheelTapAgain: "再次轻触高亮牌，抽出这张牌",
    wheelComplete: "牌阵已完成",
    wheelHint: "滑动轮盘，轻触高亮牌背",
    assetConnecting: "正在连接云托管资源",
    assetCheckingRemote: "正在确认高清资源",
    assetLocalReady: "使用本地备用资源",
    assetReady: "资源已加载",
    resourceLocal: "本地资源",
    resourceRemote: "高清资源",
    noCardsError: "请先抽牌。",
    cloudWaiting: "正在等待 AI 解读。",
    backendWaiting: "正在等待备用后端解读。",
    backendRetry: "备用连接已中断，正在重新等待。",
    aiRetry: "云开发 AI 暂未完成，正在尝试备用后端。",
    backendMissing: "云开发 AI 尚未配置。可连接备用后端，或暂时查看结构化演示解读。",
    fallbackPrefix: "正在显示结构化备用解读。",
    localDemo: "本地演示",
    oauthReady: "AI 解读已就绪",
    oauthDisconnected: "未连接",
    oauthBackupReady: "备用后端已就绪",
    oauthMissingKey: "模型密钥缺失",
    buildLabel: "0.9.1 双语版本"
  },
  en: {
    assetGateTitle: "Setting the table",
    assetGateLoading: "Loading cards and music",
    assetRetry: "Retry",
    title: "Tarot",
    modeChange: "Full Spreads / Readers",
    modeSimple: "Single · Misty",
    musicOnLabel: "Mute music",
    musicOffLabel: "Play music",
    questionPlaceholder: "What do you want to ask Misty?",
    planAPlaceholder: "Plan A",
    planBPlaceholder: "Plan B",
    submitButton: "Submit",
    safetyNote: "AI-generated content, for entertainment and self-reflection only. It is not professional advice or a certain prediction. The wheel pre-shuffles the deck before the reading.",
    wheelDrawPrefix: "Drawing card ",
    wheelDrawMiddle: "/",
    wheelDrawSuffix: ": ",
    wheelTapAgain: "Tap the highlighted card again to draw it",
    wheelComplete: "Spread complete",
    wheelHint: "Spin the wheel and tap the highlighted back",
    assetConnecting: "Connecting to CloudBase assets",
    assetCheckingRemote: "Checking high-resolution resources",
    assetLocalReady: "Using local fallback resources",
    assetReady: "Resources loaded",
    resourceLocal: "Local",
    resourceRemote: "High-res",
    noCardsError: "Draw a card first.",
    cloudWaiting: "Waiting for the AI reading.",
    backendWaiting: "Waiting for the backup reader.",
    backendRetry: "Backup connection paused, waiting again.",
    aiRetry: "Cloud AI is still pending; trying the backup reader.",
    backendMissing: "Cloud AI is not configured. You can connect the backup reader or view the structured demo reading.",
    fallbackPrefix: "Showing the structured fallback reading.",
    localDemo: "Local demo",
    oauthReady: "AI reader ready",
    oauthDisconnected: "Disconnected",
    oauthBackupReady: "backup ready",
    oauthMissingKey: "model key missing",
    buildLabel: "0.9.1 bilingual"
  }
};

const READING_START_ATTEMPTS = 2;
const READING_START_RECOVERY_ATTEMPTS = 4;
const READING_VALID_JSON_ATTEMPTS = 3;
const READING_REQUEST_TIMEOUT_MS = 30000;
const READING_POLL_TIMEOUT_MS = 180000;
const READING_RETRY_DELAY_MS = 900;
const READING_POLL_DELAY_MS = 1500;
const cloudAIEnabled = hasCloudBaseAI(appConfig.cloudAI);
const REMOTE_ASSET_BASE_URL = normalizeAssetBaseUrl(appConfig.assets && appConfig.assets.baseUrl);
const cardFaceFileOverrides = {
  the_lovers: "TheLovers.jpg",
  strength: "thestrength.jpeg"
};
const WHEEL_CARD_BACK_FILE = "card-back.png";
const LOCAL_CARD_BACK_FALLBACK_PATH = "/images/card-back-fallback.png";
const WHEEL_CARD_STRIDE_RPX = 32;
const WHEEL_ARC_MAX_DISTANCE = 7;
const WHEEL_ARC_TAIL_DISTANCE = 12;
const WHEEL_ARC_RADIUS_RPX = 1080;
const WHEEL_ARC_START_DEGREES = 180;
const WHEEL_ARC_END_DEGREES = 120;
const WHEEL_ARC_CENTER_DEGREES = (WHEEL_ARC_START_DEGREES + WHEEL_ARC_END_DEGREES) / 2;
const WHEEL_ARC_ACTIVE_Y_RPX = 32;
const WHEEL_ENTRY_ARC_FRACTION = 1 / 12;
const WHEEL_ENTRY_EXPAND_DELAY_MS = 80;
const WHEEL_ARC_SPREAD_MS = 1120;
const WHEEL_FINISH_RIGHT_SPIN_MS = 280;
const WHEEL_HOME_ANCHOR_ID = "wheel-scroll-home";
const WHEEL_STACK_COLLAPSE_MS = 660;
const WHEEL_DRAW_FLIGHT_MS = 1120;
const WHEEL_VIBRATE_THROTTLE_MS = 55;
const MUSIC_TRACK_PATHS = {
  intro: createRemoteAssetUrl("music", "bgm_intro.m4a"),
  introBar: createRemoteAssetUrl("music", "bgm_intro_bar.m4a")
};
const LOCAL_MUSIC_TRACK_PATHS = {
  intro: "/music/bgm_intro_fallback.m4a",
  introBar: "/music/bgm_intro_bar_fallback.m4a",
  rain: "/music/sfx_intro_rain_fallback.m4a"
};
const MUSIC_TRACK_NEXT = {
  intro: "introBar",
  introBar: "intro"
};
const INTRO_RAIN_TRACK_PATH = createRemoteAssetUrl("music", "sfx_intro_rain.m4a");
const INTRO_RAIN_VOLUME = 0.34;
const INTRO_RAIN_FADE_MS = 1000;
const INTRO_RAIN_FADE_STEPS = 10;

const tarotDeck = [
  {
    id: "the_fool",
    name: "The Fool",
    arcana: "Major Arcana",
    uprightMeanings: ["new beginnings", "faith", "spontaneity", "adventure"],
    reversedMeanings: ["recklessness", "hesitation", "naivety", "poor planning"]
  },
  {
    id: "the_magician",
    name: "The Magician",
    arcana: "Major Arcana",
    uprightMeanings: ["manifestation", "skill", "focus", "resourcefulness"],
    reversedMeanings: ["manipulation", "scattered energy", "unused potential"]
  },
  {
    id: "the_high_priestess",
    name: "The High Priestess",
    arcana: "Major Arcana",
    uprightMeanings: ["intuition", "mystery", "inner wisdom", "subconscious"],
    reversedMeanings: ["secrets", "blocked intuition", "confusion"]
  },
  {
    id: "the_empress",
    name: "The Empress",
    arcana: "Major Arcana",
    uprightMeanings: ["abundance", "creativity", "nurturing", "growth"],
    reversedMeanings: ["stagnation", "overgiving", "creative block"]
  },
  {
    id: "the_emperor",
    name: "The Emperor",
    arcana: "Major Arcana",
    uprightMeanings: ["structure", "authority", "discipline", "stability"],
    reversedMeanings: ["control issues", "rigidity", "lack of structure"]
  },
  {
    id: "the_hierophant",
    name: "The Hierophant",
    arcana: "Major Arcana",
    uprightMeanings: ["tradition", "teaching", "community", "shared values"],
    reversedMeanings: ["dogma", "nonconformity", "stale advice", "questioning rules"]
  },
  {
    id: "the_lovers",
    name: "The Lovers",
    arcana: "Major Arcana",
    uprightMeanings: ["choice", "alignment", "relationship", "values"],
    reversedMeanings: ["misalignment", "difficult choice", "imbalance"]
  },
  {
    id: "the_chariot",
    name: "The Chariot",
    arcana: "Major Arcana",
    uprightMeanings: ["momentum", "willpower", "direction", "self-control"],
    reversedMeanings: ["forcefulness", "scattered effort", "stalling", "inner conflict"]
  },
  {
    id: "strength",
    name: "Strength",
    arcana: "Major Arcana",
    uprightMeanings: ["courage", "patience", "compassion", "inner steadiness"],
    reversedMeanings: ["self-doubt", "reactivity", "fatigue", "unprocessed fear"]
  },
  {
    id: "the_hermit",
    name: "The Hermit",
    arcana: "Major Arcana",
    uprightMeanings: ["reflection", "solitude", "discernment", "inner guidance"],
    reversedMeanings: ["isolation", "avoidance", "overthinking", "withdrawal"]
  },
  {
    id: "wheel_of_fortune",
    name: "Wheel of Fortune",
    arcana: "Major Arcana",
    uprightMeanings: ["change", "cycles", "timing", "turning point"],
    reversedMeanings: ["resistance", "setback", "pattern repetition", "instability"]
  },
  {
    id: "justice",
    name: "Justice",
    arcana: "Major Arcana",
    uprightMeanings: ["truth", "accountability", "fairness", "clear consequences"],
    reversedMeanings: ["bias", "avoidance", "unfairness", "unclear facts"]
  },
  {
    id: "the_hanged_man",
    name: "The Hanged Man",
    arcana: "Major Arcana",
    uprightMeanings: ["surrender", "new perspective", "pause", "release"],
    reversedMeanings: ["stagnation", "martyrdom", "delay", "resisting insight"]
  },
  {
    id: "death",
    name: "Death",
    arcana: "Major Arcana",
    uprightMeanings: ["ending", "transition", "renewal", "letting go"],
    reversedMeanings: ["clinging", "fear of change", "unfinished closure", "stasis"]
  },
  {
    id: "temperance",
    name: "Temperance",
    arcana: "Major Arcana",
    uprightMeanings: ["balance", "integration", "moderation", "healing rhythm"],
    reversedMeanings: ["excess", "impatience", "imbalance", "disharmony"]
  },
  {
    id: "the_devil",
    name: "The Devil",
    arcana: "Major Arcana",
    uprightMeanings: ["attachment", "temptation", "shadow patterns", "material focus"],
    reversedMeanings: ["release", "reclaiming power", "breaking patterns", "awareness"]
  },
  {
    id: "the_tower",
    name: "The Tower",
    arcana: "Major Arcana",
    uprightMeanings: ["disruption", "revelation", "breakthrough", "false structure falling"],
    reversedMeanings: ["avoided change", "aftershock", "fear of upheaval", "slow rebuild"]
  },
  {
    id: "the_star",
    name: "The Star",
    arcana: "Major Arcana",
    uprightMeanings: ["hope", "renewal", "inspiration", "gentle trust"],
    reversedMeanings: ["discouragement", "dimmed faith", "disconnect", "needing rest"]
  },
  {
    id: "the_moon",
    name: "The Moon",
    arcana: "Major Arcana",
    uprightMeanings: ["uncertainty", "dreams", "intuition", "hidden feelings"],
    reversedMeanings: ["confusion lifting", "anxiety", "misread signals", "avoidance"]
  },
  {
    id: "the_sun",
    name: "The Sun",
    arcana: "Major Arcana",
    uprightMeanings: ["clarity", "vitality", "joy", "confidence"],
    reversedMeanings: ["muted joy", "overconfidence", "temporary cloudiness", "burnout"]
  },
  {
    id: "judgement",
    name: "Judgement",
    arcana: "Major Arcana",
    uprightMeanings: ["awakening", "reckoning", "calling", "self-review"],
    reversedMeanings: ["self-criticism", "avoidance", "doubt", "unfinished lesson"]
  },
  {
    id: "the_world",
    name: "The World",
    arcana: "Major Arcana",
    uprightMeanings: ["completion", "integration", "fulfillment", "arrival"],
    reversedMeanings: ["loose ends", "delayed closure", "unfinished business", "almost there"]
  }
].concat(createMinorArcanaDeck());

function createMinorArcanaDeck() {
  const suits = [
    {
      id: "wands",
      name: "Wands",
      arcana: "Minor Arcana",
      theme: "energy, creativity, and action",
      cards: [
        ["ace", "Ace", ["spark", "initiative", "potential"], ["delay", "misfire", "unclear motivation"]],
        ["two", "Two", ["planning", "vision", "choice"], ["hesitation", "limited view", "fear of expansion"]],
        ["three", "Three", ["growth", "foresight", "momentum"], ["waiting", "small setbacks", "scattered plans"]],
        ["four", "Four", ["celebration", "stability", "homecoming"], ["tension at home", "delayed joy", "unstable footing"]],
        ["five", "Five", ["competition", "friction", "testing"], ["avoidance", "inner conflict", "unproductive struggle"]],
        ["six", "Six", ["recognition", "progress", "confidence"], ["private win", "self-doubt", "delayed recognition"]],
        ["seven", "Seven", ["defense", "conviction", "boundaries"], ["overwhelm", "defensiveness", "giving ground"]],
        ["eight", "Eight", ["speed", "messages", "movement"], ["delays", "miscommunication", "rushed choices"]],
        ["nine", "Nine", ["resilience", "guardedness", "persistence"], ["fatigue", "suspicion", "needing rest"]],
        ["ten", "Ten", ["burden", "responsibility", "pressure"], ["release", "delegation", "unsustainable load"]],
        ["page", "Page", ["curiosity", "fresh passion", "experiment"], ["restlessness", "immaturity", "false starts"]],
        ["knight", "Knight", ["boldness", "pursuit", "adventure"], ["impulsiveness", "impatience", "scattered fire"]],
        ["queen", "Queen", ["warmth", "confidence", "magnetism"], ["jealousy", "burnout", "dimmed confidence"]],
        ["king", "King", ["leadership", "vision", "courage"], ["domination", "impatience", "unchecked ego"]]
      ]
    },
    {
      id: "cups",
      name: "Cups",
      arcana: "Minor Arcana",
      theme: "feelings, relationships, and intuition",
      cards: [
        ["ace", "Ace", ["opening heart", "emotional renewal", "compassion"], ["blocked feeling", "emotional overflow", "guardedness"]],
        ["two", "Two", ["connection", "mutual care", "harmony"], ["imbalance", "misalignment", "strained bond"]],
        ["three", "Three", ["friendship", "support", "shared joy"], ["excess", "social tension", "feeling left out"]],
        ["four", "Four", ["reflection", "discontent", "reassessment"], ["new interest", "acceptance", "lifting apathy"]],
        ["five", "Five", ["loss", "regret", "grief"], ["acceptance", "repair", "turning toward hope"]],
        ["six", "Six", ["nostalgia", "kindness", "memory"], ["stuck in the past", "growing up", "idealization"]],
        ["seven", "Seven", ["options", "imagination", "temptation"], ["clarity", "choosing", "grounding fantasy"]],
        ["eight", "Eight", ["leaving", "searching", "emotional honesty"], ["avoidance", "returning", "fear of moving on"]],
        ["nine", "Nine", ["satisfaction", "gratitude", "wish fulfilled"], ["overindulgence", "hollow pleasure", "unmet longing"]],
        ["ten", "Ten", ["fulfillment", "family harmony", "belonging"], ["surface harmony", "misaligned values", "domestic strain"]],
        ["page", "Page", ["gentleness", "creative feeling", "message"], ["emotional immaturity", "shyness", "mixed signals"]],
        ["knight", "Knight", ["romance", "idealism", "invitation"], ["moodiness", "unrealistic promise", "avoidance"]],
        ["queen", "Queen", ["empathy", "intuition", "emotional depth"], ["overgiving", "sensitivity", "blurred boundaries"]],
        ["king", "King", ["emotional steadiness", "wisdom", "compassion"], ["suppressed feeling", "manipulation", "cool distance"]]
      ]
    },
    {
      id: "swords",
      name: "Swords",
      arcana: "Minor Arcana",
      theme: "thought, truth, and communication",
      cards: [
        ["ace", "Ace", ["clarity", "truth", "breakthrough"], ["confusion", "harsh words", "unclear thinking"]],
        ["two", "Two", ["stalemate", "choice", "blocked view"], ["indecision lifting", "avoidance exposed", "information arriving"]],
        ["three", "Three", ["heartbreak", "truth pain", "release"], ["healing", "forgiveness", "lingering hurt"]],
        ["four", "Four", ["rest", "recovery", "pause"], ["restlessness", "burnout", "returning too soon"]],
        ["five", "Five", ["conflict", "hollow victory", "ego clash"], ["repair", "accountability", "stepping away"]],
        ["six", "Six", ["transition", "moving on", "mental distance"], ["resistance", "unfinished transition", "emotional baggage"]],
        ["seven", "Seven", ["strategy", "secrecy", "self-protection"], ["truth revealed", "self-deception", "changing tactics"]],
        ["eight", "Eight", ["restriction", "overthinking", "feeling trapped"], ["new perspective", "release", "choice returning"]],
        ["nine", "Nine", ["anxiety", "worry", "rumination"], ["support", "perspective", "facing fears"]],
        ["ten", "Ten", ["ending", "mental exhaustion", "finality"], ["recovery", "survival", "new dawn"]],
        ["page", "Page", ["curiosity", "observation", "direct words"], ["gossip", "scattered thought", "defensiveness"]],
        ["knight", "Knight", ["speed", "argument", "decisive action"], ["recklessness", "haste", "tunnel vision"]],
        ["queen", "Queen", ["discernment", "honesty", "clear boundaries"], ["coldness", "bitterness", "overanalysis"]],
        ["king", "King", ["logic", "authority", "fair judgment"], ["rigidity", "misuse of intellect", "detachment"]]
      ]
    },
    {
      id: "pentacles",
      name: "Pentacles",
      arcana: "Minor Arcana",
      theme: "body, work, money, and the material world",
      cards: [
        ["ace", "Ace", ["opportunity", "seed", "material start"], ["missed chance", "delay", "ungrounded plan"]],
        ["two", "Two", ["balance", "adaptability", "priorities"], ["overload", "disorganization", "dropped ball"]],
        ["three", "Three", ["skill", "collaboration", "craft"], ["misalignment", "poor teamwork", "unfinished work"]],
        ["four", "Four", ["security", "holding on", "control"], ["release", "scarcity fear", "generosity lesson"]],
        ["five", "Five", ["hardship", "exclusion", "support needed"], ["recovery", "help available", "hope returning"]],
        ["six", "Six", ["generosity", "exchange", "fair support"], ["imbalance", "strings attached", "uneven giving"]],
        ["seven", "Seven", ["patience", "assessment", "long-term growth"], ["impatience", "poor investment", "reassessment"]],
        ["eight", "Eight", ["practice", "discipline", "mastery"], ["perfectionism", "boredom", "cutting corners"]],
        ["nine", "Nine", ["self-sufficiency", "comfort", "earned ease"], ["dependence", "overwork", "fragile security"]],
        ["ten", "Ten", ["legacy", "stability", "family resources"], ["family pressure", "short-term thinking", "unstable legacy"]],
        ["page", "Page", ["study", "practical offer", "beginner focus"], ["procrastination", "lack of follow-through", "unready plan"]],
        ["knight", "Knight", ["reliability", "routine", "steady progress"], ["stagnation", "stubbornness", "drudgery"]],
        ["queen", "Queen", ["nurture", "practical care", "resourcefulness"], ["overextension", "neglecting self", "material worry"]],
        ["king", "King", ["stability", "leadership", "material mastery"], ["greed", "rigidity", "status attachment"]]
      ]
    }
  ];

  const deck = [];

  suits.forEach((suit) => {
    suit.cards.forEach((cardInfo) => {
      const rankId = cardInfo[0];
      const rankName = cardInfo[1];
      const uprightMeanings = cardInfo[2];
      const reversedMeanings = cardInfo[3];

      deck.push({
        id: `${rankId}_of_${suit.id}`,
        name: `${rankName} of ${suit.name}`,
        arcana: suit.arcana,
        uprightMeanings: uprightMeanings.concat(suit.theme),
        reversedMeanings
      });
    });
  });

  return deck;
}

const majorCardInfo = {
  the_fool: {
    name: "愚者",
    upright: ["新的开始", "信任", "自发性", "冒险精神"],
    reversed: ["鲁莽", "迟疑", "天真", "计划不足"]
  },
  the_magician: {
    name: "魔术师",
    upright: ["显化", "技巧", "专注", "资源整合"],
    reversed: ["操控", "能量分散", "潜力未用"]
  },
  the_high_priestess: {
    name: "女祭司",
    upright: ["直觉", "秘密", "内在智慧", "潜意识"],
    reversed: ["隐瞒", "直觉受阻", "困惑"]
  },
  the_empress: {
    name: "女皇",
    upright: ["丰盛", "创造力", "滋养", "成长"],
    reversed: ["停滞", "过度付出", "创造力受阻"]
  },
  the_emperor: {
    name: "皇帝",
    upright: ["结构", "权威", "纪律", "稳定"],
    reversed: ["控制欲", "僵化", "缺乏秩序"]
  },
  the_hierophant: {
    name: "教皇",
    upright: ["传统", "学习", "共同体", "价值观"],
    reversed: ["教条", "不合常规", "过时建议", "质疑规则"]
  },
  the_lovers: {
    name: "恋人",
    upright: ["选择", "一致", "关系", "价值排序"],
    reversed: ["不协调", "艰难选择", "失衡"]
  },
  the_chariot: {
    name: "战车",
    upright: ["推进", "意志力", "方向", "自我掌控"],
    reversed: ["用力过猛", "力量分散", "停滞", "内在冲突"]
  },
  strength: {
    name: "力量",
    upright: ["勇气", "耐心", "温柔的力量", "内在稳定"],
    reversed: ["自我怀疑", "反应过度", "疲惫", "未处理的恐惧"]
  },
  the_hermit: {
    name: "隐士",
    upright: ["沉思", "独处", "辨别", "内在指引"],
    reversed: ["孤立", "逃避", "想太多", "退缩"]
  },
  wheel_of_fortune: {
    name: "命运之轮",
    upright: ["变化", "周期", "时机", "转折点"],
    reversed: ["抗拒", "挫折", "模式重复", "不稳定"]
  },
  justice: {
    name: "正义",
    upright: ["真相", "责任", "公平", "清楚后果"],
    reversed: ["偏见", "回避", "不公", "事实不明"]
  },
  the_hanged_man: {
    name: "倒吊人",
    upright: ["暂停", "新视角", "放下", "转念"],
    reversed: ["停滞", "牺牲感", "延迟", "抗拒领悟"]
  },
  death: {
    name: "死神",
    upright: ["结束", "转化", "更新", "放手"],
    reversed: ["执着", "害怕改变", "未完成的告别", "僵持"]
  },
  temperance: {
    name: "节制",
    upright: ["平衡", "整合", "适度", "疗愈节奏"],
    reversed: ["过度", "急躁", "失衡", "不协调"]
  },
  the_devil: {
    name: "恶魔",
    upright: ["依附", "诱惑", "阴影模式", "物质牵引"],
    reversed: ["松绑", "夺回力量", "打破模式", "觉察"]
  },
  the_tower: {
    name: "高塔",
    upright: ["震动", "揭露", "突破", "旧结构崩塌"],
    reversed: ["回避改变", "余震", "害怕动荡", "缓慢重建"]
  },
  the_star: {
    name: "星星",
    upright: ["希望", "更新", "灵感", "温柔信任"],
    reversed: ["灰心", "信念变弱", "失去连接", "需要休息"]
  },
  the_moon: {
    name: "月亮",
    upright: ["不确定", "梦境", "直觉", "隐藏感受"],
    reversed: ["迷雾散开", "焦虑", "误读讯号", "逃避"]
  },
  the_sun: {
    name: "太阳",
    upright: ["清晰", "生命力", "喜悦", "自信"],
    reversed: ["喜悦减弱", "过度自信", "暂时阴影", "耗竭"]
  },
  judgement: {
    name: "审判",
    upright: ["觉醒", "回顾", "召唤", "自我审视"],
    reversed: ["自我批判", "回避", "怀疑", "未完成的功课"]
  },
  the_world: {
    name: "世界",
    upright: ["完成", "整合", "圆满", "抵达"],
    reversed: ["收尾未完", "延迟结束", "未竟之事", "只差一步"]
  }
};

const minorSuitInfo = {
  wands: {
    name: "权杖",
    upright: ["行动力", "创造力", "热情"],
    reversed: ["急躁", "能量分散", "行动受阻"]
  },
  cups: {
    name: "圣杯",
    upright: ["情感", "关系", "直觉"],
    reversed: ["情绪失衡", "边界模糊", "感受受阻"]
  },
  swords: {
    name: "宝剑",
    upright: ["思考", "沟通", "真相"],
    reversed: ["想法混乱", "言语压力", "判断失衡"]
  },
  pentacles: {
    name: "星币",
    upright: ["现实", "资源", "身体与工作"],
    reversed: ["资源紧张", "执行不稳", "现实压力"]
  }
};

const minorRankInfo = {
  ace: {
    name: "一",
    upright: ["开端", "种子", "新机会"],
    reversed: ["机会延迟", "起步不稳", "潜力未落地"]
  },
  two: {
    name: "二",
    upright: ["选择", "平衡", "调整"],
    reversed: ["犹豫", "失衡", "优先级混乱"]
  },
  three: {
    name: "三",
    upright: ["扩展", "协作", "初步成果"],
    reversed: ["配合不顺", "进展延迟", "方向需重整"]
  },
  four: {
    name: "四",
    upright: ["稳定", "基础", "安全感"],
    reversed: ["停滞", "过度防守", "安全感不稳"]
  },
  five: {
    name: "五",
    upright: ["冲突", "挑战", "重新定位"],
    reversed: ["修复", "退让", "从争执中抽身"]
  },
  six: {
    name: "六",
    upright: ["过渡", "支持", "阶段性进展"],
    reversed: ["迟滞", "不平衡", "旧模式牵扯"]
  },
  seven: {
    name: "七",
    upright: ["评估", "选择", "坚持立场"],
    reversed: ["分心", "信心不足", "需要重新选择"]
  },
  eight: {
    name: "八",
    upright: ["推进", "练习", "持续投入"],
    reversed: ["拖延", "过度用力", "节奏失衡"]
  },
  nine: {
    name: "九",
    upright: ["接近完成", "韧性", "个人成果"],
    reversed: ["疲惫", "过度防备", "满足感不足"]
  },
  ten: {
    name: "十",
    upright: ["完成", "累积", "阶段收束"],
    reversed: ["负担过重", "收尾困难", "需要释放"]
  },
  page: {
    name: "侍从",
    upright: ["学习", "讯息", "新的尝试"],
    reversed: ["不成熟", "三分钟热度", "行动不足"]
  },
  knight: {
    name: "骑士",
    upright: ["追求", "行动", "推进"],
    reversed: ["冲动", "固执", "方向不稳"]
  },
  queen: {
    name: "王后",
    upright: ["成熟表达", "滋养", "内在掌握"],
    reversed: ["过度付出", "情绪消耗", "边界需要修复"]
  },
  king: {
    name: "国王",
    upright: ["掌控", "领导", "稳定力量"],
    reversed: ["僵化", "控制过度", "权力失衡"]
  }
};

const minorCardInfo = {
  ace_of_wands: {
    name: "权杖一",
    upright: ["灵感火花", "行动冲动", "创造潜力", "新热情"],
    reversed: ["热情受阻", "动机不清", "延迟启动", "火花熄灭"]
  },
  two_of_wands: {
    name: "权杖二",
    upright: ["远景规划", "等待决定", "扩张意图", "选择方向"],
    reversed: ["迟疑", "视野受限", "害怕扩张", "计划卡住"]
  },
  three_of_wands: {
    name: "权杖三",
    upright: ["远方机会", "扩张", "等待成果", "势头打开"],
    reversed: ["延迟回音", "计划分散", "小挫折", "缺少协同"]
  },
  four_of_wands: {
    name: "权杖四",
    upright: ["庆祝", "稳定关系", "归属感", "阶段安顿"],
    reversed: ["家里有张力", "放松被打断", "还没完全安顿", "表面平静"]
  },
  five_of_wands: {
    name: "权杖五",
    upright: ["竞争", "摩擦", "立场碰撞", "试炼"],
    reversed: ["避免冲突", "内耗", "无效争执", "停战需求"]
  },
  six_of_wands: {
    name: "权杖六",
    upright: ["认可", "胜利", "公开肯定", "信心回升"],
    reversed: ["私下胜利", "延迟认可", "自我怀疑", "面子压力"]
  },
  seven_of_wands: {
    name: "权杖七",
    upright: ["防守", "坚持立场", "压力下自证", "边界"],
    reversed: ["被压倒", "防御过度", "让步", "信念动摇"]
  },
  eight_of_wands: {
    name: "权杖八",
    upright: ["快速消息", "推进", "突然动向", "行动加速"],
    reversed: ["延迟", "误会", "急躁决定", "讯息混乱"]
  },
  nine_of_wands: {
    name: "权杖九",
    upright: ["韧性", "防备", "受伤后的坚持", "最后防线"],
    reversed: ["疲惫", "疑心", "需要休息", "旧伤触发"]
  },
  ten_of_wands: {
    name: "权杖十",
    upright: ["负担", "压力", "责任", "过度承担"],
    reversed: ["释放负担", "分担责任", "压力缓解", "不可持续"]
  },
  page_of_wands: {
    name: "权杖侍从",
    upright: ["好奇", "新热情", "试探消息", "冒险想法"],
    reversed: ["三分钟热度", "不成熟", "起头又停下", "躁动"]
  },
  knight_of_wands: {
    name: "权杖骑士",
    upright: ["追逐", "冒险", "热烈推进", "冲动魅力"],
    reversed: ["冲动", "急躁", "方向分散", "热情不稳"]
  },
  queen_of_wands: {
    name: "权杖王后",
    upright: ["自信魅力", "温暖", "吸引力", "自主创造"],
    reversed: ["嫉妒", "耗竭", "信心暗淡", "控制热情"]
  },
  king_of_wands: {
    name: "权杖国王",
    upright: ["领导力", "远见", "行动掌控", "大胆决策"],
    reversed: ["支配欲", "急躁", "自负", "火气失控"]
  },
  ace_of_cups: {
    name: "圣杯一",
    upright: ["情感开启", "新关系", "爱意流动", "直觉苏醒"],
    reversed: ["情感封闭", "情绪压抑", "爱意回收", "直觉受阻"]
  },
  two_of_cups: {
    name: "圣杯二",
    upright: ["互相吸引", "关系和解", "平等连接", "合作"],
    reversed: ["失衡关系", "不信任", "分离", "单方面付出"]
  },
  three_of_cups: {
    name: "圣杯三",
    upright: ["庆祝", "友情", "支持网络", "共享喜悦"],
    reversed: ["社交张力", "三角感", "过度放纵", "被排除"]
  },
  four_of_cups: {
    name: "圣杯四",
    upright: ["冷淡", "不满", "重新评估", "情绪停滞"],
    reversed: ["重新打开", "接受机会", "厌倦消退", "内在校准"]
  },
  five_of_cups: {
    name: "圣杯五",
    upright: ["失落", "遗憾", "悲伤", "看见缺失"],
    reversed: ["接纳", "修复", "自我原谅", "从失望转身"]
  },
  six_of_cups: {
    name: "圣杯六",
    upright: ["怀旧", "旧人旧事", "温柔回忆", "纯真"],
    reversed: ["困在过去", "理想化", "成长分离", "旧情褪色"]
  },
  seven_of_cups: {
    name: "圣杯七",
    upright: ["幻想", "选择太多", "诱惑", "不切实际"],
    reversed: ["看清选择", "落地", "价值对齐", "从幻想醒来"]
  },
  eight_of_cups: {
    name: "圣杯八",
    upright: ["离开", "抽身", "寻找更深意义", "情感诚实"],
    reversed: ["想回头", "逃避离开", "犹豫不决", "漫无目的"]
  },
  nine_of_cups: {
    name: "圣杯九",
    upright: ["满足", "愿望实现", "情感享受", "自我满足"],
    reversed: ["空虚快乐", "不满足", "享乐过度", "愿望落空"]
  },
  ten_of_cups: {
    name: "圣杯十",
    upright: ["幸福关系", "家庭和谐", "归属", "共同愿景"],
    reversed: ["表面和气", "想法不合", "关系有距离", "家里有压力"]
  },
  page_of_cups: {
    name: "圣杯侍从",
    upright: ["温柔讯息", "小心动", "创意感受", "直觉邀请"],
    reversed: ["情绪不成熟", "羞怯", "暧昧信号", "创意受阻"]
  },
  knight_of_cups: {
    name: "圣杯骑士",
    upright: ["浪漫靠近", "邀请", "理想主义", "情感表达"],
    reversed: ["忽冷忽热", "不现实承诺", "回避", "情绪化"]
  },
  queen_of_cups: {
    name: "圣杯王后",
    upright: ["共情", "直觉深度", "情感照顾", "温柔容纳"],
    reversed: ["过度付出", "边界模糊", "敏感过载", "情绪依赖"]
  },
  king_of_cups: {
    name: "圣杯国王",
    upright: ["情绪稳定", "成熟关怀", "克制表达", "温柔掌舵"],
    reversed: ["压抑感受", "操控情绪", "冷淡距离", "情绪不稳"]
  },
  ace_of_swords: {
    name: "宝剑一",
    upright: ["真相突破", "清晰判断", "新想法", "直接沟通"],
    reversed: ["思路混乱", "判断云雾", "话语伤人", "真相未明"]
  },
  two_of_swords: {
    name: "宝剑二",
    upright: ["僵局", "艰难选择", "回避真相", "封闭感知"],
    reversed: ["僵局松动", "信息到来", "回避暴露", "不得不选"]
  },
  three_of_swords: {
    name: "宝剑三",
    upright: ["心碎", "痛苦真相", "分离", "伤口显现"],
    reversed: ["疗愈", "宽恕", "伤口未愈", "释放悲伤"]
  },
  four_of_swords: {
    name: "宝剑四",
    upright: ["休息", "恢复", "暂停", "精神避难"],
    reversed: ["焦躁", "过早返回", "休息不足", "倦怠"]
  },
  five_of_swords: {
    name: "宝剑五",
    upright: ["冲突", "空洞胜利", "自尊之争", "伤人沟通"],
    reversed: ["修复", "承担责任", "退一步", "和解可能"]
  },
  six_of_swords: {
    name: "宝剑六",
    upright: ["过渡", "离开困境", "心智距离", "带伤前行"],
    reversed: ["抗拒前进", "旧包袱", "未完成过渡", "回头牵扯"]
  },
  seven_of_swords: {
    name: "宝剑七",
    upright: ["策略", "隐瞒", "自保", "不完全诚实"],
    reversed: ["真相揭露", "改策略", "自欺被看见", "坦白压力"]
  },
  eight_of_swords: {
    name: "宝剑八",
    upright: ["受限", "过度思考", "困住感", "自我束缚"],
    reversed: ["新视角", "释放", "选择回归", "限制松动"]
  },
  nine_of_swords: {
    name: "宝剑九",
    upright: ["焦虑", "失眠", "懊悔", "精神压力"],
    reversed: ["寻求支持", "面对恐惧", "透气空间", "停止反刍"]
  },
  ten_of_swords: {
    name: "宝剑十",
    upright: ["结束", "精神耗竭", "触底", "不可再拖"],
    reversed: ["复原", "幸存", "新黎明", "伤痛余波"]
  },
  page_of_swords: {
    name: "宝剑侍从",
    upright: ["观察", "试探消息", "好奇心", "警觉沟通"],
    reversed: ["流言", "防御性", "心思散乱", "监视感"]
  },
  knight_of_swords: {
    name: "宝剑骑士",
    upright: ["快速行动", "争辩", "直冲真相", "急速沟通"],
    reversed: ["鲁莽", "急躁", "隧道视野", "言语攻击"]
  },
  queen_of_swords: {
    name: "宝剑王后",
    upright: ["辨别", "清醒边界", "诚实", "独立判断"],
    reversed: ["冷酷", "苦涩", "过度分析", "情感切断"]
  },
  king_of_swords: {
    name: "宝剑国王",
    upright: ["逻辑权威", "公正判断", "清晰规则", "理性掌控"],
    reversed: ["僵化", "滥用理性", "冷漠", "权威压迫"]
  },
  ace_of_pentacles: {
    name: "星币一",
    upright: ["现实机会", "物质开端", "资源种子", "可落地承诺"],
    reversed: ["错失机会", "延迟", "计划不落地", "资源不足"]
  },
  two_of_pentacles: {
    name: "星币二",
    upright: ["平衡任务", "优先级", "灵活应对", "多线处理"],
    reversed: ["超载", "失序", "顾此失彼", "优先级混乱"]
  },
  three_of_pentacles: {
    name: "星币三",
    upright: ["协作", "技艺", "团队建设", "被看见的能力"],
    reversed: ["配合不良", "标准不一", "未完成工作", "缺少认可"]
  },
  four_of_pentacles: {
    name: "星币四",
    upright: ["守住资源", "安全感", "控制", "不愿放手"],
    reversed: ["释放控制", "学会分享", "匮乏恐惧", "资源松动"]
  },
  five_of_pentacles: {
    name: "星币五",
    upright: ["困难", "匮乏", "被排除", "需要求助"],
    reversed: ["恢复", "看见支持", "走出孤立", "希望回来"]
  },
  six_of_pentacles: {
    name: "星币六",
    upright: ["给予与接受", "公平交换", "支援", "权力不均"],
    reversed: ["失衡付出", "有条件的帮助", "债务感", "不公平交换"]
  },
  seven_of_pentacles: {
    name: "星币七",
    upright: ["耐心等待", "评估成果", "长期投入", "慢回报"],
    reversed: ["急躁", "投资不当", "重新评估", "回报延迟"]
  },
  eight_of_pentacles: {
    name: "星币八",
    upright: ["练习", "专注打磨", "技能成长", "勤奋"],
    reversed: ["完美主义", "厌倦", "偷工减料", "努力失焦"]
  },
  nine_of_pentacles: {
    name: "星币九",
    upright: ["独立丰盛", "自足", "优雅享受", "成果感"],
    reversed: ["依赖", "过劳", "安全感脆弱", "外在光鲜"]
  },
  ten_of_pentacles: {
    name: "星币十",
    upright: ["长期稳定", "传承", "共同资源", "安全结构"],
    reversed: ["家里有压力", "只顾眼前", "想法不一致", "缺少安定感"]
  },
  page_of_pentacles: {
    name: "星币侍从",
    upright: ["学习现实技能", "实用消息", "计划起步", "专注"],
    reversed: ["拖延", "缺少执行", "不成熟计划", "学习失焦"]
  },
  knight_of_pentacles: {
    name: "星币骑士",
    upright: ["稳定推进", "可靠", "例行努力", "踏实责任"],
    reversed: ["停滞", "固执", "苦差事", "保守过头"]
  },
  queen_of_pentacles: {
    name: "星币王后",
    upright: ["滋养照顾", "务实安全", "资源管理", "身体感"],
    reversed: ["过度承担", "忽略自己", "物质焦虑", "照顾失衡"]
  },
  king_of_pentacles: {
    name: "星币国王",
    upright: ["物质掌握", "稳定领导", "成功经营", "保护资源"],
    reversed: ["贪婪", "僵化", "地位执着", "控制资源"]
  }
};

function localizeTarotDeck(deck) {
  deck.forEach((card) => {
    const info = getCardInfo(card.id);

    if (!info) {
      return;
    }

    card.nameEn = card.name;
    card.arcanaEn = card.arcana;
    card.uprightMeaningsEn = card.uprightMeanings;
    card.reversedMeaningsEn = card.reversedMeanings;
    card.nameZh = info.name;
    card.arcanaZh = card.arcana === "Major Arcana" ? "大阿卡那" : "小阿卡那";
    card.uprightMeaningsZh = info.upright;
    card.reversedMeaningsZh = info.reversed;
    card.name = card.nameZh;
    card.arcana = card.arcanaZh;
    card.uprightMeanings = card.uprightMeaningsZh;
    card.reversedMeanings = card.reversedMeaningsZh;
  });
}

function getCardInfo(cardId) {
  if (majorCardInfo[cardId]) {
    return majorCardInfo[cardId];
  }

  if (minorCardInfo[cardId]) {
    return minorCardInfo[cardId];
  }

  const match = cardId.match(/^(.+)_of_(.+)$/);

  if (!match) {
    return null;
  }

  const rank = minorRankInfo[match[1]];
  const suit = minorSuitInfo[match[2]];

  if (!rank || !suit) {
    return null;
  }

  return {
    name: `${suit.name}${rank.name}`,
    upright: rank.upright.concat(suit.upright),
    reversed: rank.reversed.concat(suit.reversed)
  };
}

localizeTarotDeck(tarotDeck);

function createModeSummary(spread, reader, mode, language) {
  const ui = getUiCopy(language);

  if (
    (!spread || spread.id === SIMPLE_SPREAD_ID) &&
      (!reader || reader.id === SIMPLE_READER_ID)
  ) {
    return ui.modeSimple;
  }

  return `${spread.title} · ${reader.title}`;
}

function getUiCopy(language) {
  return uiCopy[normalizeLanguageCode(language)] || uiCopy.zh;
}

function createLocalizedCard(card, language) {
  const languageCode = normalizeLanguageCode(language);

  if (languageCode === "en") {
    return {
      name: card.nameEn || card.name,
      arcana: card.arcanaEn || card.arcana,
      uprightMeanings: card.uprightMeaningsEn || card.uprightMeanings,
      reversedMeanings: card.reversedMeaningsEn || card.reversedMeanings
    };
  }

  return {
    name: card.nameZh || card.name,
    arcana: card.arcanaZh || card.arcana,
    uprightMeanings: card.uprightMeaningsZh || card.uprightMeanings,
    reversedMeanings: card.reversedMeaningsZh || card.reversedMeanings
  };
}

function createReadingQuestion({ question, spread, decisionOptions, language }) {
  const safeQuestion = String(question || "").trim();
  const languageCode = normalizeLanguageCode(language);

  if (!spread || spread.id !== "decisionPair") {
    return safeQuestion;
  }

  const options = decisionOptions || {};
  const planA = String(options.planA || "").trim();
  const planB = String(options.planB || "").trim();

  if (languageCode === "en") {
    return [
      "Please compare the following two plans and give a preferred direction.",
      `Question: ${safeQuestion || "Not filled in"}`,
      `Plan A: ${planA || "Not filled in"}`,
      `Plan B: ${planB || "Not filled in"}`
    ].join("\n");
  }

  return [
    "请围绕这个问题，在以下两个方案中给出选择倾向。",
    `问题：${safeQuestion || "未填写"}`,
    `方案 A：${planA || "未填写"}`,
    `方案 B：${planB || "未填写"}`
  ].join("\n");
}

function getInitialLanguage() {
  if (typeof wx === "undefined" || !wx.getStorageSync) {
    return DEFAULT_LANGUAGE_CODE;
  }

  try {
    return normalizeLanguageCode(wx.getStorageSync(LANGUAGE_STORAGE_KEY));
  } catch (error) {
    return DEFAULT_LANGUAGE_CODE;
  }
}

const initialLanguage = getInitialLanguage();
const initialSpreads = createSpreads(initialLanguage);
const initialWheelCards = createWheelCards(null, initialLanguage);

Page({
  data: {
    language: initialLanguage,
    languages: languageOptions,
    ui: getUiCopy(initialLanguage),
    question: "",
    decisionOptions: {
      planA: "",
      planB: ""
    },
    spreads: initialSpreads,
    selectedSpreadId: SIMPLE_SPREAD_ID,
    selectedSpread: initialSpreads[0],
    readerProfiles: readerProfileOptions,
    selectedReaderId: SIMPLE_READER_ID,
    selectedReader: getReaderProfileOption(SIMPLE_READER_ID),
    readingMode: "simple",
    modeSummary: getUiCopy(initialLanguage).modeSimple,
    drawnCards: [],
    drawnSummarySections: [],
    wheelCards: initialWheelCards,
    wheel: createClosedWheelState(),
    interpretation: null,
    oauthSession: null,
    oauthStatus: formatOAuthStatus(null, initialLanguage),
    backendStatus: formatBackendStatus(),
    buildLabel: getUiCopy(initialLanguage).buildLabel,
    assets: {
      ready: false,
      loading: true,
      error: "",
      loaded: 0,
      total: 0,
      progress: 0,
      message: getUiCopy(initialLanguage).assetGateLoading,
      resourceLabel: ""
    },
    music: {
      enabled: true,
      playing: false,
      currentTrack: "intro"
    },
    isConnecting: false,
    isInterpreting: false,
    errorMessage: ""
  },

  onLoad() {
    this.refreshOAuthSession();
    this.applyReadingModeFromStorage();
    loadRemoteAssets(this);
  },

  onShow() {
    this.applyReadingModeFromStorage();
    resumeIntroRainOnHome(this);
  },

  onReady() {
    this._pageReady = true;
    loadRemoteAssets(this);
    startAmbientAudioWhenReady(this);
  },

  onUnload() {
    clearWheelAnimationTimers(this);
    destroyMusic(this);
    destroyIntroRain(this);
  },

  retryLoadAssets() {
    loadRemoteAssets(this);
  },

  toggleMusic() {
    if (!this.data.assets.ready || isReadingPending(this)) {
      return;
    }

    if (this.data.music.enabled) {
      this.setData({
        "music.enabled": false
      });
      stopMusic(this);
      stopIntroRain(this);
      return;
    }

    this.setData({
      "music.enabled": true
    });
    startMusicTrack(this, this.data.music.currentTrack || "intro");
    startIntroRain(this);
  },

  onQuestionInput(event) {
    if (isReadingPending(this)) {
      return;
    }

    this.setData({
      question: event.detail.value,
      interpretation: null,
      errorMessage: ""
    });
  },

  goAdvancedMode() {
    if (isReadingPending(this)) {
      return;
    }

    if (typeof wx === "undefined" || !wx.navigateTo) {
      return;
    }

    wx.navigateTo({
      url: "/pages/advanced/advanced"
    });
  },

  onDecisionOptionInput(event) {
    if (isReadingPending(this)) {
      return;
    }

    const option = event.currentTarget.dataset.option;

    if (option !== "planA" && option !== "planB") {
      return;
    }

    this.setData({
      [`decisionOptions.${option}`]: event.detail.value,
      interpretation: null,
      errorMessage: ""
    });
  },

  selectSpread(event) {
    const spreadId = event.currentTarget.dataset.spreadId;
    const selectedSpread = getSpreadById(this.data.spreads, spreadId);

    this.setData({
      selectedSpreadId: spreadId,
      selectedSpread,
      modeSummary: createModeSummary(selectedSpread, this.data.selectedReader, this.data.readingMode, this.data.language),
      drawnCards: [],
      drawnSummarySections: [],
      interpretation: null,
      errorMessage: ""
    });
  },

  selectLanguage(event) {
    if (isReadingPending(this)) {
      return;
    }

    const language = normalizeLanguageCode(event.currentTarget.dataset.language);

    if (language === this.data.language) {
      return;
    }

    const localizedSpreads = createSpreads(language);
    const selectedSpread = getSpreadById(localizedSpreads, this.data.selectedSpreadId);
    const localizedDrawnCards = localizeDrawnCardsForLanguage(this.data.drawnCards, selectedSpread, language);
    const localizedWheelCards = this.data.wheelCards && this.data.wheelCards.length
      ? localizeWheelCardsForLanguage(this.data.wheelCards, language)
      : [];
    const ui = getUiCopy(language);

    saveLanguagePreference(language);

    this.setData({
      language,
      ui,
      spreads: localizedSpreads,
      selectedSpread,
      modeSummary: createModeSummary(selectedSpread, this.data.selectedReader, this.data.readingMode, language),
      drawnCards: localizedDrawnCards,
      drawnSummarySections: createDrawnSummarySections(selectedSpread, localizedDrawnCards),
      wheelCards: localizedWheelCards,
      interpretation: null,
      errorMessage: "",
      oauthStatus: formatOAuthStatus(this.data.oauthSession, language),
      buildLabel: ui.buildLabel,
      "assets.message": this.data.assets.ready
        ? (this.data.assets.resourceLabel === getUiCopy(this.data.language).resourceLocal ? ui.assetLocalReady : ui.assetReady)
        : ui.assetGateLoading,
      "assets.resourceLabel": localizeResourceLabel(this.data.assets, language)
    });

    if (this.data.wheel && this.data.wheel.isOpen) {
      this.setData({
        "wheel.currentDrawPosition": getWheelDrawPosition(selectedSpread, this.data.wheel.drawnCount),
        "wheel.cardBackSrc": getCardBackPath(this._assetPaths)
      });
    }
  },

  selectReader(event) {
    const readerId = event.currentTarget.dataset.readerId;
    const selectedReader = getReaderProfileOption(readerId);

    this.setData({
      selectedReaderId: selectedReader.id,
      selectedReader,
      modeSummary: createModeSummary(this.data.selectedSpread, selectedReader, this.data.readingMode, this.data.language),
      interpretation: null,
      errorMessage: ""
    });
  },

  applyReadingModeFromStorage() {
    if (this.data.wheel && this.data.wheel.isOpen) {
      return;
    }

    const mode = getStoredReadingMode();
    const spreadId = mode.mode === "advanced" ? mode.spreadId : SIMPLE_SPREAD_ID;
    const readerId = mode.mode === "advanced" ? mode.readerId : SIMPLE_READER_ID;
    const selectedSpread = getSpreadById(this.data.spreads, spreadId);
    const selectedReader = getReaderProfileOption(readerId);

    if (
      selectedSpread.id === this.data.selectedSpreadId &&
        selectedReader.id === this.data.selectedReaderId &&
        mode.mode === this.data.readingMode
    ) {
      return;
    }

    this.setData({
      readingMode: mode.mode,
      selectedSpreadId: selectedSpread.id,
      selectedSpread,
      selectedReaderId: selectedReader.id,
      selectedReader,
      modeSummary: createModeSummary(selectedSpread, selectedReader, mode.mode, this.data.language),
      decisionOptions: mode.mode === "advanced" && selectedSpread.id === "decisionPair"
        ? this.data.decisionOptions
        : {
            planA: "",
            planB: ""
          },
      drawnCards: [],
      drawnSummarySections: [],
      wheelCards: prepareWheelCardsForIdle(this.data.wheelCards, this._assetPaths, this.data.language),
      wheel: createClosedWheelState(this._assetPaths),
      interpretation: null,
      errorMessage: ""
    });
  },

  drawCards() {
    if (!this.data.assets.ready || this.data.wheel.isOpen || isReadingPending(this)) {
      return;
    }

    const wheelCards = prepareWheelCardsForDraw(this.data.wheelCards, this._assetPaths, this.data.language);
    const wheel = createOpenWheelState(this.data.selectedSpread, this._assetPaths);

    clearWheelAnimationTimers(this);
    this._wheelScrollLeft = 0;
    this._wheelRpxRatio = getWheelRpxRatio(this);
    this._lastWheelPresentationAt = 0;
    this._lastWheelPresentationPosition = 0;

    this.setData({
      drawnCards: [],
      drawnSummarySections: [],
      wheelCards,
      wheel,
      interpretation: null,
      errorMessage: ""
    });

    startWheelIntroAnimation(this);
    dismissIntroRainForDraw(this);
  },

  tapDeckStage() {
    if (this.data.wheel.isOpen) {
      return;
    }

    this.drawCards();
  },

  onWheelNativeScroll(event) {
    if (!canSpinWheel(this.data.wheel)) {
      return;
    }

    handleWheelNativeScroll(this, event.detail && event.detail.scrollLeft);
  },

  onWheelCardTap(event) {
    if (isReadingPending(this)) {
      return;
    }

    const index = Number(event.currentTarget.dataset.index);

    if (index !== this.data.wheel.activeIndex) {
      return;
    }

    handleWheelActiveCardTap(this);
  },

  interpretReading() {
    if (!this.data.drawnCards.length) {
      this.setData({
        errorMessage: pageText(this, "noCardsError")
      });
      return;
    }

    const readingQuestion = createReadingQuestion({
      question: this.data.question,
      spread: this.data.selectedSpread,
      decisionOptions: this.data.decisionOptions,
      language: this.data.language
    });
    const readingRequest = createReadingRequest({
      question: readingQuestion,
      spread: this.data.selectedSpread,
      drawnCards: this.data.drawnCards,
      readerProfile: this.data.selectedReader,
      decisionOptions: this.data.decisionOptions,
      language: this.data.language
    });
    const fallbackReading = createFallbackReading({
      question: readingQuestion,
      spread: this.data.selectedSpread,
      drawnCards: this.data.drawnCards,
      readerProfile: this.data.selectedReader,
      language: this.data.language,
      sourceLabel: cloudAIEnabled
        ? resolveCloudAISourceLabel(appConfig.cloudAI, readingRequest)
        : this.data.oauthSession
          ? this.data.oauthSession.label
          : pageText(this, "localDemo")
    });

    if (!cloudAIEnabled && !canUseBackend(this.data.oauthSession)) {
      const notice = hasUsableOAuth(this.data.oauthSession)
        ? ""
        : pageText(this, "backendMissing");

      this.openReadingResult({
        interpretation: normalizeReading(fallbackReading, null, this.data.language),
        question: readingQuestion,
        notice
      });
      return;
    }

    this.setData({
      isInterpreting: true,
      errorMessage: ""
    });

    requestReadingFromBestProvider({
      oauthSession: this.data.oauthSession,
      readingRequest,
      language: this.data.language,
      onRetry: () => {
        this.setData({
          errorMessage: pageText(this, "aiRetry")
        });
      },
      onWaiting: (message) => {
        this.setData({
          errorMessage: message || pageText(this, "cloudWaiting")
        });
      }
    })
      .then((result) => {
        this.openReadingResult({
          interpretation: normalizeReading(result.reading, fallbackReading, this.data.language),
          question: readingQuestion,
          notice: result.warning || ""
        });
      })
      .catch((error) => {
        this.openReadingResult({
          interpretation: normalizeReading(fallbackReading, null, this.data.language),
          question: readingQuestion,
          notice: `${formatProviderError(error, this.data.language)}${pageText(this, "fallbackPrefix")}`
        });
      })
      .finally(() => {
        this.setData({
          isInterpreting: false
        });
      });
  },

  openReadingResult({ interpretation, question, notice }) {
    saveLatestReadingResult({
      interpretation,
      drawnCards: this.data.drawnCards,
      spread: this.data.selectedSpread,
      reader: this.data.selectedReader,
      question,
      decisionOptions: this.data.decisionOptions,
      language: this.data.language,
      notice: notice || "",
      createdAt: Date.now()
    });

    this.setData({
      interpretation: null,
      drawnCards: [],
      drawnSummarySections: [],
      wheelCards: prepareWheelCardsForIdle(this.data.wheelCards, this._assetPaths, this.data.language),
      wheel: createClosedWheelState(this._assetPaths),
      errorMessage: ""
    });

    if (typeof wx !== "undefined" && wx.navigateTo) {
      wx.navigateTo({
        url: "/pages/reading/reading"
      });
    }
  },

  blockPendingInteraction() {
    return false;
  },

  connectReadingBackend() {
    this.setData({
      isConnecting: true,
      errorMessage: ""
    });

    connectReadingBackend()
      .then((session) => {
        this.setData({
          oauthSession: session,
          oauthStatus: formatOAuthStatus(session, this.data.language),
          errorMessage: session.modelConfigured === false
              ? (this.data.language === "en" ? "Backup backend connected, but the model key is not configured." : "备用后端已连接，但模型密钥尚未配置。")
              : ""
        });
      })
      .catch((error) => {
        this.setData({
          errorMessage: error.message || "无法连接 AI 解读后端。"
        });
      })
      .finally(() => {
        this.setData({
          isConnecting: false
        });
      });
  },

  disconnectReadingBackend() {
    clearReadingBackendSession();
    this.refreshOAuthSession();
  },

  refreshOAuthSession() {
    const oauthSession = loadReadingBackendSession();

    this.setData({
      oauthSession,
      oauthStatus: formatOAuthStatus(oauthSession, this.data.language)
    });
  }
});

function requestReadingFromBestProvider(options) {
  const ui = getUiCopy(options.language);

  if (cloudAIEnabled) {
    if (typeof options.onWaiting === "function") {
      options.onWaiting(ui.cloudWaiting);
    }

    return requestValidReadingFromProvider(
      options,
      () => createCloudBaseReading({
        cloudAIConfig: appConfig.cloudAI,
        readingRequest: options.readingRequest
      }),
      normalizeLanguageCode(options.language) === "en" ? "AI reading" : "AI 解读"
    )
      .catch((error) => {
        if (!canUseBackend(options.oauthSession)) {
          throw error;
        }

        if (typeof options.onRetry === "function") {
          options.onRetry(error);
        }

        return requestValidReadingFromProvider(
          options,
          () => requestBackendReading(options),
          normalizeLanguageCode(options.language) === "en" ? "backup reader" : "备用后端"
        );
      });
  }

  return requestValidReadingFromProvider(
    options,
    () => requestBackendReading(options),
    normalizeLanguageCode(options.language) === "en" ? "backup reader" : "备用后端"
  );
}

function requestValidReadingFromProvider(options, providerRequest, providerLabel) {
  return requestValidReadingAttempt(options, providerRequest, providerLabel, 1);
}

function requestValidReadingAttempt(options, providerRequest, providerLabel, attemptNumber) {
  const languageCode = normalizeLanguageCode(options.language);
  return providerRequest()
    .then((providerResult) => {
      const result = createProviderReadingResult(providerResult);

      assertValidReading(result.reading, options.readingRequest);
      return result;
    })
    .catch((error) => {
      if (!isRetryableReadingFormatError(error) || attemptNumber >= READING_VALID_JSON_ATTEMPTS) {
        throw error;
      }

      if (typeof options.onWaiting === "function") {
        options.onWaiting(
          languageCode === "en"
            ? `${providerLabel} returned an incomplete format; regenerating (${attemptNumber + 1}/${READING_VALID_JSON_ATTEMPTS}).`
            : `${providerLabel} 返回格式不完整，正在重新生成（${attemptNumber + 1}/${READING_VALID_JSON_ATTEMPTS}）。`
        );
      }

      return delayReadingRetry().then(() => (
        requestValidReadingAttempt(options, providerRequest, providerLabel, attemptNumber + 1)
      ));
    });
}

function createProviderReadingResult(providerResult) {
  if (
    providerResult &&
      typeof providerResult === "object" &&
      Object.prototype.hasOwnProperty.call(providerResult, "reading")
  ) {
    return providerResult;
  }

  return {
    reading: providerResult
  };
}

function delayReadingRetry() {
  return new Promise((resolve) => {
    setTimeout(resolve, READING_RETRY_DELAY_MS);
  });
}

function requestBackendReading(options) {
  const requestId = createRequestId();
  const oauthSession = options.oauthSession;
  const useCloudRunBackend =
    oauthSession &&
    oauthSession.transport === "cloudRun" &&
    hasCloudRun(appConfig.cloudRun) &&
    appConfig.oauth.readingPath;

  if (typeof options.onWaiting === "function") {
    options.onWaiting(getUiCopy(options.language).backendWaiting);
  }

  return requestReadingWithPolling({
    url: appConfig.oauth.readingEndpoint,
    startUrl: createAsyncReadingUrl(appConfig.oauth.readingEndpoint),
    statusUrl: createReadingStatusUrl(appConfig.oauth.readingEndpoint, requestId),
    path: appConfig.oauth.readingPath,
    startPath: createAsyncReadingPath(appConfig.oauth.readingPath),
    statusPath: createReadingStatusPath(appConfig.oauth.readingPath, requestId),
    request: useCloudRunBackend ? callCloudRun : null,
    header: {
      Authorization: `${oauthSession.tokenType || "Bearer"} ${oauthSession.accessToken}`,
      "Content-Type": "application/json",
      "X-Request-Id": requestId
    },
    data: {
      request: options.readingRequest,
      responseFormat: readingJsonSchema()
    },
    onRetry: () => {
      if (typeof options.onWaiting === "function") {
        options.onWaiting(getUiCopy(options.language).backendRetry);
      }
    },
    onWaiting: options.onWaiting
  }).then((response) => {
    const data = response.data || {};

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw createBackendReadingError(data.error, response.statusCode);
    }

    return {
      reading: data.reading || data,
      warning: data.backend && data.backend.modelConfigured === false
        ? "备用后端已连接，但模型生成尚未配置。"
        : ""
    };
  });
}

function createBackendReadingError(errorMessage, statusCode) {
  const error = new Error(formatReadingError(errorMessage));

  if (statusCode >= 500 && isAiReadingJsonErrorMessage(error.message)) {
    error.code = "INVALID_AI_READING_JSON";
    error.retryableReadingFormat = true;
  }

  return error;
}

function isAiReadingJsonErrorMessage(message) {
  const text = String(message || "");

  return (
    text.indexOf("AI 响应") !== -1 &&
      text.indexOf("JSON") !== -1
  ) || text.indexOf("AI 解读 JSON") !== -1;
}

function canUseBackend(oauthSession) {
  return Boolean(
    hasUsableOAuth(oauthSession) &&
      (
        appConfig.oauth.readingEndpoint ||
        (hasCloudRun(appConfig.cloudRun) && appConfig.oauth.readingPath)
      )
  );
}

function requestReadingWithPolling(options) {
  const startedAt = Date.now();

  return startReadingRequest(options, READING_START_ATTEMPTS).then((response) => {
    if (response.statusCode === 202) {
      if (typeof options.onWaiting === "function") {
        options.onWaiting();
      }

      return pollReadingStatus(options, startedAt, getRetryDelay(response), READING_START_RECOVERY_ATTEMPTS);
    }

    return response;
  }).catch(() => {
    if (typeof options.onWaiting === "function") {
      options.onWaiting();
    }

    return pollReadingStatus(options, startedAt, READING_POLL_DELAY_MS, READING_START_RECOVERY_ATTEMPTS);
  });
}

function startReadingRequest(options, attemptsRemaining) {
  return requestBackendTransport(options, {
    url: options.startUrl || options.url,
    path: options.startPath || options.path,
    method: "POST",
    timeout: READING_REQUEST_TIMEOUT_MS,
    header: options.header,
    data: options.data
  }).catch((error) => {
    if (attemptsRemaining > 1) {
      if (typeof options.onRetry === "function") {
        options.onRetry(error);
      }

      return new Promise((resolve, reject) => {
        setTimeout(() => {
          startReadingRequest(options, attemptsRemaining - 1).then(resolve).catch(reject);
        }, READING_RETRY_DELAY_MS);
      });
    }

    throw error;
  });
}

function requestBackendTransport(options, requestOptions) {
  if (typeof options.request === "function") {
    return options.request(requestOptions);
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: requestOptions.url,
      method: requestOptions.method,
      timeout: requestOptions.timeout,
      header: requestOptions.header,
      data: requestOptions.data,
      success: resolve,
      fail: reject
    });
  });
}

function pollReadingStatus(options, startedAt, delayMs, recoveryStartsRemaining) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (Date.now() - startedAt > READING_POLL_TIMEOUT_MS) {
        reject({
          errMsg: "timed out waiting for reading response"
        });
        return;
      }

      requestBackendTransport(options, {
        url: options.statusUrl,
        path: options.statusPath,
        method: "GET",
        timeout: READING_REQUEST_TIMEOUT_MS,
        header: {
          Authorization: options.header.Authorization
        }
      })
        .then((response) => {
          if (response.statusCode === 202) {
            if (typeof options.onWaiting === "function") {
              options.onWaiting();
            }

            pollReadingStatus(options, startedAt, getRetryDelay(response), recoveryStartsRemaining).then(resolve).catch(reject);
            return;
          }

          if (response.statusCode === 404 && recoveryStartsRemaining > 0) {
            if (typeof options.onRetry === "function") {
              options.onRetry(response);
            }

            startReadingRequest(options, 1)
              .then((startResponse) => {
                if (startResponse.statusCode !== 202) {
                  resolve(startResponse);
                  return;
                }

                pollReadingStatus(options, startedAt, getRetryDelay(startResponse), recoveryStartsRemaining - 1)
                  .then(resolve)
                  .catch(reject);
              })
              .catch(() => {
                pollReadingStatus(options, startedAt, READING_POLL_DELAY_MS, recoveryStartsRemaining - 1)
                  .then(resolve)
                  .catch(reject);
              });
            return;
          }

          resolve(response);
        })
        .catch(() => {
          pollReadingStatus(options, startedAt, READING_POLL_DELAY_MS, recoveryStartsRemaining).then(resolve).catch(reject);
        });
    }, delayMs);
  });
}

function getRetryDelay(response) {
  const retryAfterMs = response && response.data && Number(response.data.retryAfterMs);

  return Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : READING_POLL_DELAY_MS;
}

function createAsyncReadingUrl(readingEndpoint) {
  const separator = readingEndpoint.indexOf("?") === -1 ? "?" : "&";

  return `${readingEndpoint}${separator}async=1`;
}

function createAsyncReadingPath(readingPath) {
  const separator = readingPath.indexOf("?") === -1 ? "?" : "&";

  return `${readingPath}${separator}async=1`;
}

function createReadingStatusUrl(readingEndpoint, requestId) {
  return `${readingEndpoint.replace(/\/readings$/, "/readings/status")}?requestId=${encodeURIComponent(requestId)}`;
}

function createReadingStatusPath(readingPath, requestId) {
  return `${readingPath.replace(/\/readings$/, "/readings/status")}?requestId=${encodeURIComponent(requestId)}`;
}

function createRequestId() {
  return `reading-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createClosedWheelState(assetPaths) {
  return {
    isOpen: false,
    scrollLeft: 0,
    scrollIntoView: "",
    scrollWithAnimation: false,
    activeIndex: 0,
    selectedIndex: -1,
    phase: "idle",
    motion: "idle",
    requiredCount: 0,
    drawnCount: 0,
    currentDrawNumber: 0,
    currentDrawPosition: "",
    cardBackSrc: getCardBackPath(assetPaths),
    revealedCard: null,
    flightCard: null,
    showDrawnSummary: false
  };
}

function createOpenWheelState(spread, assetPaths) {
  const positions = spread.positions || [];

  return {
    isOpen: true,
    scrollLeft: 0,
    scrollIntoView: "",
    scrollWithAnimation: false,
    activeIndex: 0,
    selectedIndex: -1,
    phase: "choosing",
    motion: "spreading",
    requiredCount: positions.length,
    drawnCount: 0,
    currentDrawNumber: 1,
    currentDrawPosition: getWheelDrawPosition(spread, 0),
    cardBackSrc: getCardBackPath(assetPaths),
    revealedCard: null,
    flightCard: null,
    showDrawnSummary: false
  };
}

function createWheelCards(assetPaths, language) {
  const wheelCards = shuffle(tarotDeck.slice()).map((card, index) => (
    createWheelCardSlot(card, index, assetPaths, language)
  ));

  return updateWheelCardPresentation(wheelCards, 0, "entry");
}

function prepareWheelCardsForDraw(wheelCards, assetPaths, language) {
  const preparedCards = createWheelCardsFromExistingOrder(wheelCards, assetPaths, language, true);

  return updateWheelCardPresentation(preparedCards, 0, "entry");
}

function prepareWheelCardsForIdle(wheelCards, assetPaths, language) {
  const preparedCards = createWheelCardsFromExistingOrder(wheelCards, assetPaths, language, false);

  return updateWheelCardPresentation(preparedCards, 0, "entry");
}

function refreshWheelCardAssets(wheelCards, assetPaths) {
  return wheelCards.map((slot) => Object.assign({}, slot, {
    imageSrc: getCardFacePath(slot.cardId, assetPaths)
  }));
}

function createWheelCardsFromExistingOrder(wheelCards, assetPaths, language, shouldRefreshOrientation) {
  const sourceSlots = Array.isArray(wheelCards) && wheelCards.length ? wheelCards : createWheelCards(assetPaths, language);

  return sourceSlots.map((slot, index) => {
    const card = tarotDeck.find((deckCard) => deckCard.id === slot.cardId) || tarotDeck[index % tarotDeck.length];
    const orientation = shouldRefreshOrientation
      ? createWheelCardOrientation()
      : slot.orientation;

    return createWheelCardSlot(card, index, assetPaths, language, {
      id: slot.id,
      orientation
    });
  });
}

function createWheelCardSlot(card, index, assetPaths, language, options) {
  const localizedCard = createLocalizedCard(card, language);
  const orientation = options && options.orientation ? options.orientation : createWheelCardOrientation();
  const keywords = orientation === "upright" ? localizedCard.uprightMeanings : localizedCard.reversedMeanings;

  return {
    id: options && options.id ? options.id : `wheel-${index}-${card.id}`,
    cardId: card.id,
    name: localizedCard.name,
    arcana: localizedCard.arcana,
    imageSrc: getCardFacePath(card.id, assetPaths),
    uprightMeanings: localizedCard.uprightMeanings,
    reversedMeanings: localizedCard.reversedMeanings,
    orientation,
    orientationLabel: formatOrientation(orientation, language),
    keywords,
    drawn: false
  };
}

function createWheelCardOrientation() {
  return Math.random() >= 0.5 ? "upright" : "reversed";
}

function localizeWheelCardsForLanguage(wheelCards, language) {
  return wheelCards.map((slot) => {
    const sourceCard = tarotDeck.find((card) => card.id === slot.cardId);

    if (!sourceCard) {
      return slot;
    }

    const localizedCard = createLocalizedCard(sourceCard, language);
    const keywords = slot.orientation === "upright" ? localizedCard.uprightMeanings : localizedCard.reversedMeanings;

    return Object.assign({}, slot, {
      name: localizedCard.name,
      arcana: localizedCard.arcana,
      uprightMeanings: localizedCard.uprightMeanings,
      reversedMeanings: localizedCard.reversedMeanings,
      orientationLabel: formatOrientation(slot.orientation, language),
      keywords
    });
  });
}

function localizeDrawnCardsForLanguage(drawnCards, spread, language) {
  if (!Array.isArray(drawnCards) || !drawnCards.length) {
    return [];
  }

  const positions = spread && Array.isArray(spread.positions) ? spread.positions : [];

  return drawnCards.map((drawn, index) => {
    const sourceCard = tarotDeck.find((card) => card.id === drawn.card.id);

    if (!sourceCard) {
      return Object.assign({}, drawn, {
        position: positions[index] || drawn.position,
        orientationLabel: formatOrientation(drawn.orientation, language)
      });
    }

    const localizedCard = createLocalizedCard(sourceCard, language);
    const keywords = drawn.orientation === "upright" ? localizedCard.uprightMeanings : localizedCard.reversedMeanings;

    return Object.assign({}, drawn, {
      position: positions[index] || drawn.position,
      orientationLabel: formatOrientation(drawn.orientation, language),
      keywords,
      card: Object.assign({}, drawn.card, {
        name: localizedCard.name,
        arcana: localizedCard.arcana,
        uprightMeanings: localizedCard.uprightMeanings,
        reversedMeanings: localizedCard.reversedMeanings
      })
    });
  });
}

function createDrawnSummarySections(spread, drawnCards) {
  if (!Array.isArray(drawnCards) || !drawnCards.length) {
    return [];
  }

  if (spread && Array.isArray(spread.sections) && spread.sections.length) {
    return spread.sections.map((section) => ({
      id: section.id,
      title: section.title,
      cards: drawnCards.slice(section.start - 1, section.end)
    }));
  }

  return [
    {
      id: "drawn",
      title: "",
      cards: drawnCards
    }
  ];
}

function handleWheelActiveCardTap(page) {
  if (!canSelectWheelCard(page.data.wheel)) {
    return;
  }

  const activeIndex = findNearestAvailableIndex(page.data.wheelCards, page.data.wheel.activeIndex);

  if (isFullDeckAutoSpread(page.data.selectedSpread)) {
    confirmFullDeckWheel(page, activeIndex);
    return;
  }

  const selectedIndex = page.data.wheel.selectedIndex;

  if (selectedIndex !== activeIndex) {
    page.setData({
      "wheel.activeIndex": activeIndex,
      "wheel.selectedIndex": activeIndex,
      "wheel.phase": "popped",
      "wheel.revealedCard": null
    });
    return;
  }

  confirmWheelCard(page, activeIndex);
}

function confirmFullDeckWheel(page, index) {
  const selectedSpread = page.data.selectedSpread || {};
  const wheelCards = page.data.wheelCards || [];
  const positions = Array.isArray(selectedSpread.positions) ? selectedSpread.positions : [];
  const slot = wheelCards[index];

  if (!slot) {
    return;
  }

  const nextDrawnCards = wheelCards.map((wheelSlot, slotIndex) => (
    createDrawnCardFromWheelSlot(wheelSlot, positions[slotIndex] || `Card ${slotIndex + 1}`)
  ));
  const flightCard = createWheelFlightCard(nextDrawnCards[index], index);
  const markedWheelCards = markAllWheelCardsDrawn(wheelCards);

  page._lastWheelPresentationPosition = index;
  clearWheelDrawFlightTimer(page);

  page.setData({
    drawnCards: nextDrawnCards,
    wheelCards: updateWheelCardPresentation(markedWheelCards, index),
    wheel: Object.assign({}, page.data.wheel, {
      activeIndex: index,
      selectedIndex: -1,
      phase: "drawing",
      motion: "arc",
      drawnCount: nextDrawnCards.length,
      currentDrawNumber: nextDrawnCards.length,
      currentDrawPosition: nextDrawnCards[index].position,
      revealedCard: null,
      flightCard
    })
  });

  page._wheelDrawFlightTimer = setTimeout(() => {
    page._wheelDrawFlightTimer = null;

    if (!page.data.wheel.isOpen || !page.data.wheel.flightCard || page.data.wheel.flightCard.id !== flightCard.id) {
      return;
    }

    startWheelFinishAnimation(page, page.data.wheelCards, index);
  }, WHEEL_DRAW_FLIGHT_MS);
}

function confirmWheelCard(page, index) {
  const slot = page.data.wheelCards[index];

  if (!slot || slot.drawn) {
    return;
  }

  const drawnCards = page.data.drawnCards.slice();
  const position = page.data.selectedSpread.positions[drawnCards.length];
  const drawnCard = createDrawnCardFromWheelSlot(slot, position);
  const nextDrawnCards = drawnCards.concat(drawnCard);
  const isComplete = nextDrawnCards.length >= page.data.wheel.requiredCount;
  const markedWheelCards = markWheelCardDrawn(page.data.wheelCards, index);
  const nextActiveIndex = isComplete ? index : findNearestAvailableIndex(markedWheelCards, index + 1);
  const drawingWheelCards = updateWheelCardPresentation(markedWheelCards, index);
  const flightCard = createWheelFlightCard(drawnCard, index);

  page._lastWheelPresentationPosition = index;
  clearWheelDrawFlightTimer(page);

  page.setData({
    drawnCards: nextDrawnCards,
    wheelCards: drawingWheelCards,
    wheel: Object.assign({}, page.data.wheel, {
      activeIndex: index,
      selectedIndex: -1,
      phase: "drawing",
      motion: "arc",
      drawnCount: nextDrawnCards.length,
      currentDrawNumber: Math.min(nextDrawnCards.length, page.data.wheel.requiredCount),
      currentDrawPosition: position,
      revealedCard: null,
      flightCard
    })
  });

  page._wheelDrawFlightTimer = setTimeout(() => {
    page._wheelDrawFlightTimer = null;

    if (!page.data.wheel.isOpen || !page.data.wheel.flightCard || page.data.wheel.flightCard.id !== flightCard.id) {
      return;
    }

    if (isComplete) {
      startWheelFinishAnimation(page, page.data.wheelCards, index);
      return;
    }

    const currentActiveIndex = page.data.wheel.activeIndex === index
      ? nextActiveIndex
      : findNearestAvailableIndex(page.data.wheelCards, page.data.wheel.activeIndex);

    page._lastWheelPresentationPosition = currentActiveIndex;

    page.setData({
      wheelCards: updateWheelCardPresentation(page.data.wheelCards, currentActiveIndex),
      wheel: Object.assign({}, page.data.wheel, {
        activeIndex: currentActiveIndex,
        selectedIndex: -1,
        phase: "choosing",
        currentDrawNumber: nextDrawnCards.length + 1,
        currentDrawPosition: getWheelDrawPosition(page.data.selectedSpread, nextDrawnCards.length),
        revealedCard: null,
        flightCard: null
      })
    });
  }, WHEEL_DRAW_FLIGHT_MS);
}

function getWheelDrawPosition(spread, drawIndex) {
  const positions = spread && Array.isArray(spread.positions) ? spread.positions : [];

  return positions[drawIndex] || "";
}

function createWheelFlightCard(drawnCard, slotIndex) {
  return {
    id: `${drawnCard.id}-${slotIndex}-${Date.now()}`,
    slotIndex,
    position: drawnCard.position,
    orientation: drawnCard.orientation,
    orientationLabel: drawnCard.orientationLabel,
    caption: createWheelFlightCaption(drawnCard),
    card: drawnCard.card
  };
}

function createWheelFlightCaption(drawnCard) {
  const parts = [drawnCard.position, drawnCard.card.name];

  if (drawnCard.orientation === "reversed") {
    parts.push(drawnCard.orientationLabel);
  }

  return parts.filter(Boolean).join(" · ");
}

function createDrawnCardFromWheelSlot(slot, position) {
  return {
    id: `${slot.cardId}-${position}`,
    card: {
      id: slot.cardId,
      name: slot.name,
      arcana: slot.arcana,
      uprightMeanings: slot.uprightMeanings,
      reversedMeanings: slot.reversedMeanings,
      imageSrc: slot.imageSrc
    },
    position,
    orientation: slot.orientation,
    orientationLabel: slot.orientationLabel,
    keywords: slot.keywords
  };
}

function markWheelCardDrawn(wheelCards, index) {
  return wheelCards.map((slot, slotIndex) => {
    if (slotIndex !== index) {
      return slot;
    }

    return Object.assign({}, slot, {
      drawn: true
    });
  });
}

function markAllWheelCardsDrawn(wheelCards) {
  return wheelCards.map((slot) => Object.assign({}, slot, {
    drawn: true
  }));
}

function isFullDeckAutoSpread(spread) {
  return spread && spread.drawMode === "fullDeckAuto";
}

function canSpinWheel(wheel) {
  return wheel.isOpen &&
    wheel.motion === "arc" &&
    wheel.phase !== "closing";
}

function canSelectWheelCard(wheel) {
  return canSpinWheel(wheel) &&
    (wheel.phase === "choosing" || wheel.phase === "popped");
}

function findNearestAvailableIndex(wheelCards, targetIndex) {
  if (!wheelCards.length) {
    return 0;
  }

  const normalizedTarget = normalizeWheelIndex(targetIndex);

  if (wheelCards[normalizedTarget] && !wheelCards[normalizedTarget].drawn) {
    return normalizedTarget;
  }

  for (let distance = 1; distance < wheelCards.length; distance += 1) {
    const forward = normalizeWheelIndex(normalizedTarget + distance);
    const backward = normalizeWheelIndex(normalizedTarget - distance);

    if (wheelCards[forward] && !wheelCards[forward].drawn) {
      return forward;
    }

    if (wheelCards[backward] && !wheelCards[backward].drawn) {
      return backward;
    }
  }

  return normalizedTarget;
}

function updateWheelCardPresentation(wheelCards, centerPosition, mode) {
  return wheelCards.map((slot, index) => {
    const distance = index - centerPosition;
    const arcStyle = createWheelCardStyle(distance, mode, wheelCards.length);
    const slotStyle = createWheelCardSlotStyle(distance, wheelCards.length);

    if (slot.arcStyle === arcStyle && slot.slotStyle === slotStyle) {
      return slot;
    }

    return Object.assign({}, slot, {
      arcStyle,
      slotStyle
    });
  });
}

function createWheelCardSlotStyle(distance, count) {
  const normalizedDistance = Math.min(Math.max(0, Math.round(Math.abs(distance))), Math.max(0, count - 1));

  return `z-index: ${Math.max(1, count - normalizedDistance)};`;
}

function createWheelCardStyle(distance, mode, count) {
  if (mode === "stack") {
    return createWheelCardStackStyle(distance);
  }

  if (mode === "entry") {
    return createWheelCardEntryArcStyle(distance, count);
  }

  return createWheelCardArcStyle(distance);
}

function createWheelCardStackStyle(distance) {
  const translateX = Math.round(-distance * WHEEL_CARD_STRIDE_RPX);

  return `transform: translate(${translateX}rpx, ${WHEEL_ARC_ACTIVE_Y_RPX}rpx) rotate(0.0deg) scale(0.980); opacity: 1.00;`;
}

function createWheelCardEntryArcStyle(distance, count) {
  const geometry = createWheelArcGeometry(createWheelEntryDistance(distance, count), WHEEL_ENTRY_ARC_FRACTION);
  const translateX = Math.round(geometry.translateX - distance * WHEEL_CARD_STRIDE_RPX);

  return `transform: translate(${translateX}rpx, ${Math.round(geometry.translateY)}rpx) rotate(${geometry.rotation.toFixed(1)}deg) scale(${geometry.scale.toFixed(3)}); opacity: 1.00;`;
}

function createWheelCardArcStyle(distance) {
  const geometry = createWheelArcGeometry(distance, 1);

  return `transform: translate(${Math.round(geometry.translateX)}rpx, ${Math.round(geometry.translateY)}rpx) rotate(${geometry.rotation.toFixed(1)}deg) scale(${geometry.scale.toFixed(3)}); opacity: ${geometry.opacity.toFixed(2)};`;
}

function createWheelEntryDistance(distance, count) {
  const availableCount = Math.max(1, (Number(count) || tarotDeck.length) - 1);
  const direction = distance < 0 ? -1 : 1;
  const progress = Math.min(1, Math.abs(distance) / availableCount);

  return direction * progress * WHEEL_ARC_MAX_DISTANCE;
}

function createWheelArcGeometry(distance, arcFraction) {
  const clampedDistance = Math.max(-WHEEL_ARC_TAIL_DISTANCE, Math.min(WHEEL_ARC_TAIL_DISTANCE, distance));
  const effectiveDistance = clampedDistance * arcFraction;
  const absoluteDistance = Math.abs(effectiveDistance);
  const arcProgress = effectiveDistance / WHEEL_ARC_MAX_DISTANCE;
  const angleDegrees = WHEEL_ARC_CENTER_DEGREES - arcProgress * ((WHEEL_ARC_START_DEGREES - WHEEL_ARC_END_DEGREES) / 2);
  const angleRadians = (angleDegrees * Math.PI) / 180;
  const centerRadians = (WHEEL_ARC_CENTER_DEGREES * Math.PI) / 180;
  const activeCircleX = Math.cos(centerRadians);
  const activeCircleY = Math.sin(centerRadians);
  const circleX = Math.cos(angleRadians);
  const circleY = Math.sin(angleRadians);
  const translateX = Math.round((circleX - activeCircleX) * WHEEL_ARC_RADIUS_RPX);
  const translateY = Math.round(WHEEL_ARC_ACTIVE_Y_RPX - (circleY - activeCircleY) * WHEEL_ARC_RADIUS_RPX);
  const rotation = (WHEEL_ARC_CENTER_DEGREES - angleDegrees) * 1.9;
  const scale = Math.max(0.72, 1.08 - absoluteDistance * 0.042);
  const opacity = Math.max(0.48, 1 - absoluteDistance * 0.052);

  return {
    translateX,
    translateY,
    rotation,
    scale,
    opacity
  };
}

function isReadingPending(page) {
  return Boolean(page && page.data && page.data.isInterpreting);
}

function handleWheelNativeScroll(page, scrollLeft) {
  if (!canSpinWheel(page.data.wheel)) {
    return;
  }

  const nextScrollLeft = Number(scrollLeft);

  if (!Number.isFinite(nextScrollLeft)) {
    return;
  }

  const now = Date.now();

  page._wheelScrollLeft = nextScrollLeft;

  const targetIndex = getWheelIndexFromScrollLeft(page, nextScrollLeft);
  const activeIndex = findNearestAvailableIndex(page.data.wheelCards, targetIndex);
  const shouldUpdatePresentation =
    activeIndex !== page.data.wheel.activeIndex ||
    !page._lastWheelPresentationAt;
  const updates = {};

  if (shouldUpdatePresentation) {
    page._lastWheelPresentationAt = now;
    page._lastWheelPresentationPosition = activeIndex;
    updates.wheelCards = updateWheelCardPresentation(page.data.wheelCards, activeIndex);
  }

  if (page.data.wheel.selectedIndex !== -1 || page.data.wheel.phase === "popped") {
    updates["wheel.selectedIndex"] = -1;
    updates["wheel.phase"] = "choosing";
    updates["wheel.revealedCard"] = null;
  }

  if (activeIndex !== page.data.wheel.activeIndex) {
    vibrateWheelStep(page);
    updates["wheel.activeIndex"] = activeIndex;
  }

  if (Object.keys(updates).length) {
    page.setData(updates);
  }
}

function startWheelIntroAnimation(page) {
  clearWheelIntroTimer(page);

  page._wheelIntroTimer = setTimeout(() => {
    page._wheelIntroTimer = null;

    if (!page.data.wheel.isOpen || page.data.wheel.motion !== "spreading") {
      return;
    }

    page._lastWheelPresentationAt = Date.now();
    page._lastWheelPresentationPosition = page.data.wheel.activeIndex;

    page.setData({
      wheelCards: updateWheelCardPresentation(page.data.wheelCards, page.data.wheel.activeIndex),
      "wheel.motion": "spreading"
    });

    page._wheelIntroTimer = setTimeout(() => {
      page._wheelIntroTimer = null;

      if (!page.data.wheel.isOpen || page.data.wheel.motion !== "spreading") {
        return;
      }

      page.setData({
        "wheel.motion": "arc"
      });
    }, WHEEL_ARC_SPREAD_MS);
  }, WHEEL_ENTRY_EXPAND_DELAY_MS);
}

function startWheelFinishAnimation(page, wheelCards, centerPosition) {
  clearWheelIntroTimer(page);
  clearWheelFinishTimer(page);
  clearWheelDrawFlightTimer(page);

  const spinCenterPosition = 0;

  page._lastWheelPresentationAt = Date.now();
  page._lastWheelPresentationPosition = spinCenterPosition;
  page._wheelScrollLeft = 0;

  page.setData({
    wheelCards: updateWheelCardPresentation(wheelCards, spinCenterPosition),
    wheel: Object.assign({}, page.data.wheel, {
      scrollLeft: 0,
      scrollIntoView: WHEEL_HOME_ANCHOR_ID,
      scrollWithAnimation: true,
      activeIndex: spinCenterPosition,
      selectedIndex: -1,
      phase: "closing",
      motion: "closing-spin",
      revealedCard: null,
      flightCard: null,
      showDrawnSummary: false
    })
  });

  page._wheelFinishTimer = setTimeout(() => {
    page._wheelFinishTimer = null;

    page.setData({
      wheelCards: updateWheelCardPresentation(page.data.wheelCards, 0, "entry"),
      wheel: Object.assign({}, page.data.wheel, {
        scrollLeft: 0,
        scrollIntoView: WHEEL_HOME_ANCHOR_ID,
        scrollWithAnimation: false,
        activeIndex: 0,
        selectedIndex: -1,
        phase: "closing",
        motion: "closing",
        revealedCard: null,
        flightCard: null,
        showDrawnSummary: false
      })
    });

    page._wheelFinishTimer = setTimeout(() => {
      page._wheelFinishTimer = null;
      const restoredWheelCards = prepareWheelCardsForIdle(page.data.wheelCards, page._assetPaths, page.data.language);

      page.setData({
        drawnSummarySections: createDrawnSummarySections(page.data.selectedSpread, page.data.drawnCards),
        wheelCards: restoredWheelCards,
        wheel: Object.assign({}, page.data.wheel, {
          activeIndex: 0,
          selectedIndex: -1,
          phase: "summary",
          motion: "summary",
          revealedCard: null,
          flightCard: null,
          showDrawnSummary: true
        })
      });

      page.interpretReading();
    }, WHEEL_STACK_COLLAPSE_MS);
  }, WHEEL_FINISH_RIGHT_SPIN_MS);
}

function clearWheelAnimationTimers(page) {
  clearWheelIntroTimer(page);
  clearWheelDrawFlightTimer(page);
  clearWheelFinishTimer(page);
}

function clearWheelIntroTimer(page) {
  if (page._wheelIntroTimer) {
    clearTimeout(page._wheelIntroTimer);
    page._wheelIntroTimer = null;
  }
}

function clearWheelFinishTimer(page) {
  if (page._wheelFinishTimer) {
    clearTimeout(page._wheelFinishTimer);
    page._wheelFinishTimer = null;
  }
}

function clearWheelDrawFlightTimer(page) {
  if (page._wheelDrawFlightTimer) {
    clearTimeout(page._wheelDrawFlightTimer);
    page._wheelDrawFlightTimer = null;
  }
}

function getWheelIndexFromScrollLeft(page, scrollLeft) {
  return getWheelIndexFromPosition(page, getWheelPositionFromScrollLeft(page, scrollLeft));
}

function getWheelPositionFromScrollLeft(page, scrollLeft) {
  const count = page && page.data && page.data.wheelCards && page.data.wheelCards.length
    ? page.data.wheelCards.length
    : tarotDeck.length;
  const stridePx = getWheelStridePx(page);
  const rawPosition = stridePx > 0 ? scrollLeft / stridePx : 0;

  return Math.max(0, Math.min(count - 1, rawPosition));
}

function getWheelIndexFromPosition(page, position) {
  const count = page && page.data && page.data.wheelCards && page.data.wheelCards.length
    ? page.data.wheelCards.length
    : tarotDeck.length;

  return Math.max(0, Math.min(count - 1, Math.round(position)));
}

function getWheelStridePx(page) {
  return WHEEL_CARD_STRIDE_RPX * getWheelRpxRatio(page);
}

function getWheelRpxRatio(page) {
  if (page && page._wheelRpxRatio) {
    return page._wheelRpxRatio;
  }

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

  if (page) {
    page._wheelRpxRatio = ratio;
  }

  return ratio;
}

function normalizeWheelIndex(index) {
  const count = tarotDeck.length;
  return ((index % count) + count) % count;
}

function vibrateWheelStep(page) {
  const now = Date.now();

  if (page._lastWheelVibrateAt && now - page._lastWheelVibrateAt < WHEEL_VIBRATE_THROTTLE_MS) {
    return;
  }

  page._lastWheelVibrateAt = now;

  if (typeof wx !== "undefined" && wx.vibrateShort) {
    wx.vibrateShort({
      type: "light",
      fail() {}
    });
  }
}

function saveLanguagePreference(language) {
  if (typeof wx === "undefined" || !wx.setStorageSync) {
    return;
  }

  try {
    wx.setStorageSync(LANGUAGE_STORAGE_KEY, normalizeLanguageCode(language));
  } catch (error) {
    // Storage failures should never block language switching.
  }
}

function pageText(page, key) {
  const ui = page && page.data && page.data.ui ? page.data.ui : getUiCopy(page && page.data && page.data.language);

  return ui[key] || uiCopy.zh[key] || "";
}

function localizeResourceLabel(assets, language) {
  const ui = getUiCopy(language);
  const label = assets && assets.resourceLabel;

  if (!label) {
    return "";
  }

  if (label === uiCopy.zh.resourceLocal || label === uiCopy.en.resourceLocal) {
    return ui.resourceLocal;
  }

  if (label === uiCopy.zh.resourceRemote || label === uiCopy.en.resourceRemote) {
    return ui.resourceRemote;
  }

  return label;
}

function formatOAuthStatus(session, language) {
  const ui = getUiCopy(language);

  if (cloudAIEnabled) {
    return canUseBackend(session) ? `${ui.oauthReady} · ${ui.oauthBackupReady}` : ui.oauthReady;
  }

  if (!session) {
    return ui.oauthDisconnected;
  }

  if (session.modelConfigured === false) {
    return `${session.label} · ${ui.oauthMissingKey}`;
  }

  return session.label;
}

function formatBackendStatus() {
  if (cloudAIEnabled) {
    return `${appConfig.cloudAI.model} · ${appConfig.cloudAI.envId}`;
  }

  return appConfig.oauth.readingEndpoint.replace(/\/readings$/, "");
}

function formatReadingError(errorMessage, language) {
  if (errorMessage && errorMessage.indexOf("bearer token") !== -1) {
    return normalizeLanguageCode(language) === "en"
      ? "The backend is connected, but the server has not configured an AI provider token."
      : "后端已连接，但服务器尚未配置 AI 提供方令牌。";
  }

  return errorMessage || (normalizeLanguageCode(language) === "en" ? "AI reading failed." : "AI 解读失败。");
}

function formatProviderError(error, language) {
  const message = error && (error.message || error.errMsg);

  if (message) {
    return normalizeLanguageCode(language) === "en"
      ? `Unable to generate AI reading: ${message}. `
      : `无法生成 AI 解读：${message}。`;
  }

  return normalizeLanguageCode(language) === "en" ? "Unable to generate AI reading. " : "无法生成 AI 解读。";
}

function formatOrientation(orientation, language) {
  return formatOrientationText(orientation, language);
}

function normalizeAssetBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function createRemoteAssetUrl(directory, fileName) {
  return `${REMOTE_ASSET_BASE_URL}/${directory}/${fileName}`;
}

function getCardFaceFileName(cardId) {
  return cardFaceFileOverrides[cardId] || `${cardId.replace(/_/g, "")}.jpeg`;
}

function getRemoteCardFacePath(cardId) {
  return createRemoteAssetUrl("cards", getCardFaceFileName(cardId));
}

function getCardFacePath(cardId, assetPaths) {
  if (
    assetPaths &&
      assetPaths.cardFaces &&
      Object.prototype.hasOwnProperty.call(assetPaths.cardFaces, cardId)
  ) {
    return assetPaths.cardFaces[cardId];
  }

  return getRemoteCardFacePath(cardId);
}

function getCardBackPath(assetPaths) {
  if (assetPaths && assetPaths.cardBack) {
    return assetPaths.cardBack;
  }

  return createRemoteAssetUrl("cards", WHEEL_CARD_BACK_FILE);
}

function getMusicTrackPath(page, trackKey) {
  const musicAssets = page._assetPaths && page._assetPaths.music;

  if (musicAssets && Object.prototype.hasOwnProperty.call(musicAssets, trackKey)) {
    return musicAssets[trackKey];
  }

  return MUSIC_TRACK_PATHS[trackKey];
}

function getIntroRainTrackPath(page) {
  const musicAssets = page._assetPaths && page._assetPaths.music;

  if (musicAssets && Object.prototype.hasOwnProperty.call(musicAssets, "rain")) {
    return musicAssets.rain;
  }

  return INTRO_RAIN_TRACK_PATH;
}

function createDirectRemoteAssetPaths() {
  const cardFaces = {};

  tarotDeck.forEach((card) => {
    cardFaces[card.id] = getRemoteCardFacePath(card.id);
  });

  return {
    cardBack: getCardBackPath(null),
    cardFaces,
    music: {
      intro: MUSIC_TRACK_PATHS.intro,
      introBar: MUSIC_TRACK_PATHS.introBar,
      rain: INTRO_RAIN_TRACK_PATH
    }
  };
}

function createLocalFallbackAssetPaths() {
  const cardFaces = {};

  tarotDeck.forEach((card) => {
    cardFaces[card.id] = "";
  });

  return {
    fallback: true,
    cardBack: LOCAL_CARD_BACK_FALLBACK_PATH,
    cardFaces,
    music: Object.assign({}, LOCAL_MUSIC_TRACK_PATHS)
  };
}

function loadRemoteAssets(page) {
  if (page.data.assets.ready) {
    return;
  }

  if (page._assetLoadStarted && page.data.assets.loading) {
    return;
  }

  page._assetLoadStarted = true;
  page._assetLoadToken = (page._assetLoadToken || 0) + 1;

  const loadToken = page._assetLoadToken;
  const directAssetPaths = createDirectRemoteAssetPaths();
  if (hasCloudRun(appConfig.cloudRun)) {
    page.setData({
      assets: {
        ready: false,
        loading: true,
        error: "",
        loaded: 0,
        total: 1,
        progress: 0,
        message: pageText(page, "assetConnecting"),
        resourceLabel: ""
      }
    });

    probeCloudRunAssets()
      .then(() => {
        if (loadToken !== page._assetLoadToken) {
          return;
        }

        page.setData({
          "assets.loaded": 1,
          "assets.progress": 100
        });
        activateRemoteAssets(page, directAssetPaths, loadToken);
      })
      .catch(() => {
        probeDirectRemoteAssets(page, directAssetPaths, loadToken);
      });
    return;
  }

  probeDirectRemoteAssets(page, directAssetPaths, loadToken);
}

function probeDirectRemoteAssets(page, directAssetPaths, loadToken) {
  if (typeof wx === "undefined" || !wx.getImageInfo) {
    activateRemoteAssets(page, directAssetPaths, loadToken);
    return;
  }

  page.setData({
    assets: {
      ready: false,
      loading: true,
      error: "",
      loaded: 0,
      total: 1,
      progress: 0,
      message: pageText(page, "assetCheckingRemote"),
      resourceLabel: ""
    }
  });

  loadImageAsset(directAssetPaths.cardBack)
    .then(() => {
      if (loadToken !== page._assetLoadToken) {
        return;
      }

      page.setData({
        "assets.loaded": 1,
        "assets.progress": 100
      });
      activateRemoteAssets(page, directAssetPaths, loadToken);
    })
    .catch(() => {
      if (loadToken !== page._assetLoadToken) {
        return;
      }

      page._assetLoadToken += 1;
      activateRemoteAssets(page, createLocalFallbackAssetPaths(), page._assetLoadToken);
    });
}

function probeCloudRunAssets() {
  return callCloudRun({
    path: "/health",
    method: "GET"
  }).then((response) => {
    const data = response.data || {};

    if (response.statusCode < 200 || response.statusCode >= 300 || data.ok !== true) {
      throw new Error("CloudBase Run assets are not ready.");
    }
  });
}

function activateRemoteAssets(page, assetPaths, loadToken) {
  if (loadToken !== page._assetLoadToken) {
    return;
  }

  page._assetPaths = assetPaths;
  page.setData({
    assets: {
      ready: true,
      loading: false,
      error: "",
      loaded: 1,
      total: 1,
      progress: 100,
      message: assetPaths.fallback ? pageText(page, "assetLocalReady") : pageText(page, "assetReady"),
      resourceLabel: assetPaths.fallback ? pageText(page, "resourceLocal") : pageText(page, "resourceRemote")
    },
    "wheel.cardBackSrc": assetPaths.cardBack,
    wheelCards: refreshWheelCardAssets(page.data.wheelCards, assetPaths)
  });
  startAmbientAudioWhenReady(page);
}

function loadImageAsset(url) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src: url,
      success(result) {
        resolve(result.path || url);
      },
      fail: reject
    });
  });
}

function loadDownloadedAsset(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success(result) {
        if (result.statusCode && (result.statusCode < 200 || result.statusCode >= 300)) {
          reject(new Error(`Asset download failed: ${result.statusCode}`));
          return;
        }

        resolve(result.tempFilePath || url);
      },
      fail: reject
    });
  });
}

function startAmbientAudioWhenReady(page) {
  if (!page._pageReady || !page.data.assets.ready || page._ambientAudioStarted) {
    return;
  }

  page._ambientAudioStarted = true;
  page._rainDismissed = false;
  startMusicTrack(page, "intro");
  startIntroRain(page);
}

function resumeIntroRainOnHome(page) {
  if (
    !page._pageReady ||
      !page.data.assets.ready ||
      !page.data.music.enabled ||
      isReadingPending(page) ||
      (page.data.wheel && page.data.wheel.isOpen)
  ) {
    return;
  }

  if (!page._rainDismissed && page._rainAudioContext) {
    return;
  }

  page._rainDismissed = false;
  startIntroRain(page);
}

function configureAudioSession(page) {
  if (page._musicOptionConfigured || typeof wx === "undefined" || !wx.setInnerAudioOption) {
    return;
  }

  wx.setInnerAudioOption({
    obeyMuteSwitch: false
  });
  page._musicOptionConfigured = true;
}

function getMusicSessionId(page) {
  if (!page._musicSessionId) {
    page._musicSessionId = 1;
  }

  return page._musicSessionId;
}

function resetMusicSession(page) {
  page._musicSessionId = getMusicSessionId(page) + 1;
}

function getRainSessionId(page) {
  if (!page._rainSessionId) {
    page._rainSessionId = 1;
  }

  return page._rainSessionId;
}

function resetRainSession(page) {
  page._rainSessionId = getRainSessionId(page) + 1;
}

function isCurrentMusicAudio(page, audio) {
  return Boolean(
    audio &&
      page._musicAudioContext === audio &&
      audio._sessionId === page._musicSessionId
  );
}

function isCurrentRainAudio(page, audio) {
  return Boolean(
    audio &&
      page._rainAudioContext === audio &&
      audio._sessionId === page._rainSessionId
  );
}

function ensureMusicContext(page) {
  if (page._musicAudioContext) {
    return page._musicAudioContext;
  }

  if (typeof wx === "undefined" || !wx.createInnerAudioContext) {
    return null;
  }

  configureAudioSession(page);

  const audio = wx.createInnerAudioContext();

  audio._sessionId = getMusicSessionId(page);
  audio.autoplay = true;
  audio.loop = false;
  audio.obeyMuteSwitch = false;
  if (audio.onCanplay) {
    audio.onCanplay(() => {
      if (!isCurrentMusicAudio(page, audio)) {
        return;
      }

      if (page._musicPendingPlay) {
        safePlayMusic(page);
      }
    });
  }
  if (audio.onPlay) {
    audio.onPlay(() => {
      if (!isCurrentMusicAudio(page, audio)) {
        return;
      }

      page._musicPendingPlay = false;

      if (!page.data.music.enabled) {
        audio.stop();
        page.setData({
          "music.playing": false
        });
        return;
      }

      page.setData({
        "music.playing": true
      });
    });
  }
  if (audio.onPause) {
    audio.onPause(() => {
      if (!isCurrentMusicAudio(page, audio)) {
        return;
      }

      page.setData({
        "music.playing": false
      });
    });
  }
  if (audio.onStop) {
    audio.onStop(() => {
      if (!isCurrentMusicAudio(page, audio)) {
        return;
      }

      page.setData({
        "music.playing": false
      });
    });
  }
  audio.onEnded(() => {
    if (!isCurrentMusicAudio(page, audio)) {
      return;
    }

    page._musicPendingPlay = false;
    page.setData({
      "music.playing": false
    });

    if (!page.data.music.enabled) {
      return;
    }

    startMusicTrack(page, MUSIC_TRACK_NEXT[page.data.music.currentTrack] || "intro");
  });
  audio.onError(() => {
    if (!isCurrentMusicAudio(page, audio)) {
      return;
    }

    handleMusicError(page);
  });

  page._musicAudioContext = audio;
  return audio;
}

function ensureIntroRainContext(page) {
  if (page._rainAudioContext) {
    return page._rainAudioContext;
  }

  if (typeof wx === "undefined" || !wx.createInnerAudioContext) {
    return null;
  }

  configureAudioSession(page);

  const audio = wx.createInnerAudioContext();

  audio._sessionId = getRainSessionId(page);
  audio.autoplay = true;
  audio.loop = true;
  audio.obeyMuteSwitch = false;
  audio.volume = INTRO_RAIN_VOLUME;
  if (audio.onCanplay) {
    audio.onCanplay(() => {
      if (!isCurrentRainAudio(page, audio)) {
        return;
      }

      if (page._rainPendingPlay) {
        safePlayIntroRain(page);
      }
    });
  }
  if (audio.onPlay) {
    audio.onPlay(() => {
      if (!isCurrentRainAudio(page, audio)) {
        return;
      }

      page._rainPendingPlay = false;

      if (!page.data.music.enabled || page._rainDismissed) {
        audio.stop();
      }
    });
  }
  audio.onEnded(() => {
    if (!isCurrentRainAudio(page, audio)) {
      return;
    }

    if (!page._rainDismissed && page.data.music.enabled) {
      startIntroRain(page);
    }
  });
  audio.onError(() => {
    if (!isCurrentRainAudio(page, audio)) {
      return;
    }

    handleIntroRainError(page);
  });

  page._rainAudioContext = audio;
  return audio;
}

function safePlayMusic(page) {
  const audio = page._musicAudioContext;

  if (!audio || !page.data.music.enabled) {
    return;
  }

  page._musicPendingPlay = true;

  try {
    audio.play();
  } catch (error) {
    page._musicPendingPlay = false;
    page.setData({
      "music.playing": false
    });
  }
}

function safePlayIntroRain(page) {
  const audio = page._rainAudioContext;

  if (!audio || !page.data.music.enabled || page._rainDismissed) {
    return;
  }

  page._rainPendingPlay = true;

  try {
    audio.play();
  } catch (error) {
    page._rainPendingPlay = false;
  }
}

function startMusicTrack(page, trackKey) {
  if (!page.data.music.enabled) {
    return;
  }

  const audio = ensureMusicContext(page);

  if (!audio) {
    return;
  }

  const safeTrackKey = MUSIC_TRACK_PATHS[trackKey] ? trackKey : "intro";
  const trackPath = getMusicTrackPath(page, safeTrackKey);

  if (!trackPath) {
    return;
  }

  audio.stop();
  audio.src = trackPath;
  page._musicRecoveryState = {
    trackKey: safeTrackKey,
    downloadTried: false,
    localTried: trackPath === LOCAL_MUSIC_TRACK_PATHS[safeTrackKey]
  };
  page._musicPendingPlay = true;

  page.setData({
    "music.currentTrack": safeTrackKey,
    "music.playing": false
  });
  safePlayMusic(page);
}

function startIntroRain(page) {
  if (!page.data.music.enabled || page._rainDismissed) {
    return;
  }

  clearIntroRainFadeTimer(page);

  const audio = ensureIntroRainContext(page);

  if (!audio) {
    return;
  }

  audio.loop = true;
  audio.volume = 0;
  audio.src = getIntroRainTrackPath(page);
  if (!audio.src) {
    return;
  }
  page._rainRecoveryState = {
    downloadTried: false,
    localTried: audio.src === LOCAL_MUSIC_TRACK_PATHS.rain
  };
  page._rainPendingPlay = true;
  safePlayIntroRain(page);
  fadeIntroRainVolume(page, audio, INTRO_RAIN_VOLUME);
}

function handleMusicError(page) {
  page._musicPendingPlay = false;
  page.setData({
    "music.playing": false
  });

  if (!page.data.music.enabled) {
    return;
  }

  const audio = page._musicAudioContext;
  const trackKey = page.data.music.currentTrack || "intro";
  const state = getMusicRecoveryState(page, trackKey);
  const currentSource = audio && audio.src;

  if (!state.downloadTried && isRemoteAssetUrl(currentSource) && typeof wx !== "undefined" && wx.downloadFile) {
    state.downloadTried = true;
    page._musicRecoveryState = state;
    loadDownloadedAsset(currentSource)
      .then((downloadedPath) => {
        retryMusicSource(page, trackKey, downloadedPath);
      })
      .catch(() => {
        retryLocalMusicSource(page, trackKey);
      });
    return;
  }

  retryLocalMusicSource(page, trackKey);
}

function getMusicRecoveryState(page, trackKey) {
  const state = page._musicRecoveryState;

  if (state && state.trackKey === trackKey) {
    return state;
  }

  return {
    trackKey,
    downloadTried: false,
    localTried: false
  };
}

function retryLocalMusicSource(page, trackKey) {
  const state = getMusicRecoveryState(page, trackKey);
  const fallbackPath = LOCAL_MUSIC_TRACK_PATHS[trackKey];

  if (!fallbackPath || state.localTried) {
    return;
  }

  state.localTried = true;
  page._musicRecoveryState = state;
  retryMusicSource(page, trackKey, fallbackPath);
}

function retryMusicSource(page, trackKey, sourcePath) {
  if (!page.data.music.enabled || page.data.music.currentTrack !== trackKey) {
    return;
  }

  const audio = ensureMusicContext(page);

  if (!audio || !sourcePath) {
    return;
  }

  audio.stop();
  audio.src = sourcePath;
  page._musicPendingPlay = true;
  page.setData({
    "music.playing": false
  });
  safePlayMusic(page);
}

function handleIntroRainError(page) {
  page._rainPendingPlay = false;
  clearIntroRainFadeTimer(page);

  if (!page.data.music.enabled || page._rainDismissed) {
    return;
  }

  const audio = page._rainAudioContext;
  const state = page._rainRecoveryState || {
    downloadTried: false,
    localTried: false
  };
  const currentSource = audio && audio.src;

  if (!state.downloadTried && isRemoteAssetUrl(currentSource) && typeof wx !== "undefined" && wx.downloadFile) {
    state.downloadTried = true;
    page._rainRecoveryState = state;
    loadDownloadedAsset(currentSource)
      .then((downloadedPath) => {
        retryIntroRainSource(page, downloadedPath);
      })
      .catch(() => {
        retryLocalIntroRainSource(page);
      });
    return;
  }

  retryLocalIntroRainSource(page);
}

function retryLocalIntroRainSource(page) {
  const state = page._rainRecoveryState || {
    downloadTried: false,
    localTried: false
  };

  if (state.localTried) {
    return;
  }

  state.localTried = true;
  page._rainRecoveryState = state;
  retryIntroRainSource(page, LOCAL_MUSIC_TRACK_PATHS.rain);
}

function retryIntroRainSource(page, sourcePath) {
  if (!page.data.music.enabled || page._rainDismissed) {
    return;
  }

  const audio = ensureIntroRainContext(page);

  if (!audio || !sourcePath) {
    return;
  }

  audio.stop();
  audio.loop = true;
  audio.volume = 0;
  audio.src = sourcePath;
  page._rainPendingPlay = true;
  safePlayIntroRain(page);
  fadeIntroRainVolume(page, audio, INTRO_RAIN_VOLUME);
}

function isRemoteAssetUrl(sourcePath) {
  return typeof sourcePath === "string" && /^https?:\/\//.test(sourcePath);
}

function stopMusic(page) {
  page._musicPendingPlay = false;

  if (page._musicAudioContext) {
    const audio = page._musicAudioContext;

    resetMusicSession(page);
    page._musicAudioContext = null;
    audio.stop();
    if (audio.destroy) {
      audio.destroy();
    }
  }

  page.setData({
    "music.playing": false
  });
}

function clearIntroRainFadeTimer(page) {
  if (page._rainFadeTimer) {
    clearTimeout(page._rainFadeTimer);
    page._rainFadeTimer = null;
  }
}

function stopIntroRain(page) {
  page._rainPendingPlay = false;
  clearIntroRainFadeTimer(page);

  if (page._rainAudioContext) {
    const audio = page._rainAudioContext;

    resetRainSession(page);
    page._rainAudioContext = null;
    audio.stop();
    audio.volume = INTRO_RAIN_VOLUME;
    if (audio.destroy) {
      audio.destroy();
    }
  }
}

function dismissIntroRainForDraw(page) {
  page._rainDismissed = true;
  page._rainPendingPlay = false;

  const audio = page._rainAudioContext;

  if (!audio) {
    return;
  }

  fadeIntroRainVolume(page, audio, 0, () => {
    if (isCurrentRainAudio(page, audio)) {
      stopIntroRain(page);
    }
  });
}

function fadeIntroRainVolume(page, audio, targetVolume, onComplete) {
  clearIntroRainFadeTimer(page);

  if (!audio) {
    if (typeof onComplete === "function") {
      onComplete();
    }
    return;
  }

  const startVolume = typeof audio.volume === "number" ? audio.volume : INTRO_RAIN_VOLUME;
  const safeTargetVolume = Math.max(0, Math.min(INTRO_RAIN_VOLUME, targetVolume));
  const fadeStepMs = Math.round(INTRO_RAIN_FADE_MS / INTRO_RAIN_FADE_STEPS);
  let step = 0;

  const fadeNextStep = () => {
    if (!isCurrentRainAudio(page, audio)) {
      page._rainFadeTimer = null;
      return;
    }

    step += 1;
    audio.volume = startVolume + (safeTargetVolume - startVolume) * (step / INTRO_RAIN_FADE_STEPS);

    if (step < INTRO_RAIN_FADE_STEPS) {
      page._rainFadeTimer = setTimeout(fadeNextStep, fadeStepMs);
      return;
    }

    audio.volume = safeTargetVolume;
    page._rainFadeTimer = null;

    if (typeof onComplete === "function") {
      onComplete();
    }
  };

  page._rainFadeTimer = setTimeout(fadeNextStep, fadeStepMs);
}

function destroyMusic(page) {
  page._musicPendingPlay = false;

  if (!page._musicAudioContext) {
    return;
  }

  const audio = page._musicAudioContext;

  resetMusicSession(page);
  page._musicAudioContext = null;
  audio.stop();
  audio.destroy();
}

function destroyIntroRain(page) {
  page._rainPendingPlay = false;
  clearIntroRainFadeTimer(page);

  if (!page._rainAudioContext) {
    return;
  }

  const audio = page._rainAudioContext;

  resetRainSession(page);
  page._rainAudioContext = null;
  audio.stop();
  audio.destroy();
}

function shuffle(cards) {
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
  }

  return cards;
}
