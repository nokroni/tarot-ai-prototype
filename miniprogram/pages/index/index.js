const appConfig = require("../../config");
const {
  createCloudBaseReading,
  hasCloudBaseAI
} = require("../../services/cloudbase-ai");
const {
  createFallbackReading,
  createReadingRequest,
  normalizeReading,
  readingJsonSchema
} = require("../../services/reading-schema");
const {
  clearOAuthSession,
  connectChatGPT,
  hasUsableOAuth,
  loadOAuthSession
} = require("../../services/oauth");

const spreads = [
  {
    id: "oneCard",
    title: "单张牌",
    positions: ["指引"]
  },
  {
    id: "threeCard",
    title: "三张牌",
    positions: ["现状", "挑战", "建议"]
  }
];

const READING_START_ATTEMPTS = 2;
const READING_START_RECOVERY_ATTEMPTS = 4;
const READING_REQUEST_TIMEOUT_MS = 30000;
const READING_POLL_TIMEOUT_MS = 180000;
const READING_RETRY_DELAY_MS = 900;
const READING_POLL_DELAY_MS = 1500;
const cloudAIEnabled = hasCloudBaseAI(appConfig.cloudAI);
const cardFaceFileOverrides = {
  the_lovers: "/images/TheLovers.jpg",
  strength: "/images/thestrength.jpeg"
};
const WHEEL_CARD_BACK_SRC = "/images/card-back.png";
const WHEEL_RADIUS_RPX = 860;
const WHEEL_ACTIVE_ANGLE_DEG = 45;
const WHEEL_DRAG_PX_PER_CARD = 24;
const WHEEL_REVEAL_DELAY_MS = 560;
const WHEEL_VIBRATE_THROTTLE_MS = 55;

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
        ["ten", "Ten", ["burden", "responsibility", "completion pressure"], ["release", "delegation", "unsustainable load"]],
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
    name: "皇后",
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
    name: "王牌",
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

function localizeTarotDeck(deck) {
  deck.forEach((card) => {
    const info = getCardInfo(card.id);

    if (!info) {
      return;
    }

    card.name = info.name;
    card.arcana = card.arcana === "Major Arcana" ? "大阿卡那" : "小阿卡那";
    card.uprightMeanings = info.upright;
    card.reversedMeanings = info.reversed;
  });
}

function getCardInfo(cardId) {
  if (majorCardInfo[cardId]) {
    return majorCardInfo[cardId];
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

const WHEEL_STEP_DEG = 360 / tarotDeck.length;

Page({
  data: {
    question: "",
    spreads,
    selectedSpreadId: "threeCard",
    selectedSpread: spreads[1],
    drawnCards: [],
    wheelCards: [],
    wheel: createClosedWheelState(),
    interpretation: null,
    oauthSession: null,
    oauthStatus: cloudAIEnabled ? "已连接混元" : "未连接",
    backendStatus: formatBackendStatus(),
    buildLabel: "0.6.2 弧形轮盘",
    isConnecting: false,
    isInterpreting: false,
    errorMessage: ""
  },

  onLoad() {
    this.refreshOAuthSession();
  },

  onQuestionInput(event) {
    this.setData({
      question: event.detail.value
    });
  },

  selectSpread(event) {
    const spreadId = event.currentTarget.dataset.spreadId;
    const selectedSpread = spreads.find((spread) => spread.id === spreadId) || spreads[1];

    this.setData({
      selectedSpreadId: spreadId,
      selectedSpread,
      drawnCards: [],
      interpretation: null,
      errorMessage: ""
    });
  },

  drawCards() {
    const wheelCards = createWheelCards();
    const wheel = createOpenWheelState(this.data.selectedSpread, wheelCards);

    this.setData({
      drawnCards: [],
      wheelCards,
      wheel,
      interpretation: null,
      errorMessage: ""
    });
  },

  onWheelTouchStart(event) {
    if (!this.data.wheel.isOpen || this.data.wheel.phase === "revealing") {
      return;
    }

    const touch = event.touches && event.touches[0];

    if (!touch) {
      return;
    }

    this._wheelTouchStartX = touch.clientX;
    this._wheelStartRotationDeg = this.data.wheel.rotationDeg;
    this._wheelDidDrag = false;
  },

  onWheelTouchMove(event) {
    if (!this.data.wheel.isOpen || this.data.wheel.phase === "revealing") {
      return;
    }

    const touch = event.touches && event.touches[0];

    if (!touch || typeof this._wheelTouchStartX !== "number") {
      return;
    }

    const deltaX = touch.clientX - this._wheelTouchStartX;
    const rotationDeg = this._wheelStartRotationDeg + (deltaX / WHEEL_DRAG_PX_PER_CARD) * WHEEL_STEP_DEG;
    const activeIndex = normalizeWheelIndex(Math.round(-rotationDeg / WHEEL_STEP_DEG));
    const selectedIndex = Math.abs(deltaX) > 3 ? -1 : this.data.wheel.selectedIndex;

    if (Math.abs(deltaX) > 3) {
      this._wheelDidDrag = true;
    }

    if (activeIndex !== this.data.wheel.activeIndex) {
      vibrateWheelStep(this);
    }

    this.setData({
      wheel: Object.assign({}, this.data.wheel, {
        rotationDeg,
        activeIndex,
        selectedIndex,
        phase: "choosing",
        revealedCard: null
      })
    });
  },

  onWheelTouchEnd() {
    if (!this.data.wheel.isOpen || this.data.wheel.phase === "revealing") {
      return;
    }

    const didDrag = Boolean(this._wheelDidDrag);

    if (this.data.wheel.phase === "popped" && !didDrag) {
      return;
    }

    const activeIndex = findNearestAvailableIndex(this.data.wheelCards, this.data.wheel.activeIndex);

    this._wheelDidDrag = false;
    this._wheelIgnoreNextTap = didDrag;

    this.setData({
      wheel: Object.assign({}, this.data.wheel, {
        rotationDeg: -activeIndex * WHEEL_STEP_DEG,
        activeIndex,
        selectedIndex: -1,
        phase: "choosing",
        revealedCard: null
      })
    });
  },

  onWheelFocusTap() {
    if (!this.data.wheel.isOpen || this.data.wheel.phase === "revealing") {
      return;
    }

    if (this._wheelIgnoreNextTap) {
      this._wheelIgnoreNextTap = false;
      return;
    }

    const activeIndex = findNearestAvailableIndex(this.data.wheelCards, this.data.wheel.activeIndex);
    const selectedIndex = this.data.wheel.selectedIndex;

    if (selectedIndex !== activeIndex) {
      this.setData({
        wheel: Object.assign({}, this.data.wheel, {
          rotationDeg: -activeIndex * WHEEL_STEP_DEG,
          activeIndex,
          selectedIndex: activeIndex,
          phase: "popped",
          revealedCard: null
        })
      });
      return;
    }

    confirmWheelCard(this, activeIndex);
  },

  noopTouchMove() {},

  interpretReading() {
    if (!this.data.drawnCards.length) {
      this.setData({
        errorMessage: "请先抽牌。"
      });
      return;
    }

    const fallbackReading = createFallbackReading({
      question: this.data.question,
      spread: this.data.selectedSpread,
      drawnCards: this.data.drawnCards,
      sourceLabel: cloudAIEnabled
        ? appConfig.cloudAI.sourceLabel
        : this.data.oauthSession
          ? this.data.oauthSession.label
          : "本地演示"
    });
    const readingRequest = createReadingRequest({
      question: this.data.question,
      spread: this.data.selectedSpread,
      drawnCards: this.data.drawnCards
    });

    if (!cloudAIEnabled && !canUseBackend(this.data.oauthSession)) {
      this.setData({
        interpretation: normalizeReading(fallbackReading),
        errorMessage: hasUsableOAuth(this.data.oauthSession)
          ? ""
          : "云开发 AI 尚未配置。可连接备用后端，或暂时查看结构化演示解读。"
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
      onRetry: () => {
        this.setData({
          errorMessage: "云开发 AI 暂未完成，正在尝试备用后端。"
        });
      },
      onWaiting: (message) => {
        this.setData({
          errorMessage: message || "正在等待 AI 解读。"
        });
      }
    })
      .then((result) => {
        this.setData({
          interpretation: normalizeReading(result.reading, fallbackReading),
          errorMessage: result.warning || ""
        });
      })
      .catch((error) => {
        this.setData({
          interpretation: normalizeReading(fallbackReading),
          errorMessage: `${formatProviderError(error)}正在显示结构化备用解读。`
        });
      })
      .finally(() => {
        this.setData({
          isInterpreting: false
        });
      });
  },

  connectChatGPT() {
    this.setData({
      isConnecting: true,
      errorMessage: ""
    });

    connectChatGPT()
      .then((session) => {
        this.setData({
          oauthSession: session,
          oauthStatus: formatOAuthStatus(session),
          errorMessage: session.mode === "demo"
            ? "备用后端已连接。可配置解读接口以启用服务端模型。"
            : session.openaiConfigured === false
              ? "备用后端已连接，但模型密钥尚未配置。"
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

  disconnectChatGPT() {
    clearOAuthSession();
    this.refreshOAuthSession();
  },

  refreshOAuthSession() {
    const oauthSession = loadOAuthSession();

    this.setData({
      oauthSession,
      oauthStatus: formatOAuthStatus(oauthSession)
    });
  }
});

function requestReadingFromBestProvider(options) {
  if (cloudAIEnabled) {
    if (typeof options.onWaiting === "function") {
      options.onWaiting("正在等待混元解读。");
    }

    return createCloudBaseReading({
      cloudAIConfig: appConfig.cloudAI,
      readingRequest: options.readingRequest
    })
      .then((reading) => ({
        reading
      }))
      .catch((error) => {
        if (!canUseBackend(options.oauthSession)) {
          throw error;
        }

        if (typeof options.onRetry === "function") {
          options.onRetry(error);
        }

        return requestBackendReading(options);
      });
  }

  return requestBackendReading(options);
}

function requestBackendReading(options) {
  const requestId = createRequestId();
  const oauthSession = options.oauthSession;

  if (typeof options.onWaiting === "function") {
    options.onWaiting("正在等待备用后端解读。");
  }

  return requestReadingWithPolling({
    url: appConfig.oauth.readingEndpoint,
    startUrl: createAsyncReadingUrl(appConfig.oauth.readingEndpoint),
    statusUrl: createReadingStatusUrl(appConfig.oauth.readingEndpoint, requestId),
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
        options.onWaiting("备用连接已中断，正在重新等待。");
      }
    },
    onWaiting: options.onWaiting
  }).then((response) => {
    const data = response.data || {};

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(formatReadingError(data.error));
    }

    return {
      reading: data.reading || data,
      warning: data.backend && data.backend.openaiConfigured === false
        ? "备用后端已连接，但模型生成尚未配置。"
        : ""
    };
  });
}

function canUseBackend(oauthSession) {
  return Boolean(appConfig.oauth.readingEndpoint && hasUsableOAuth(oauthSession));
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
  return new Promise((resolve, reject) => {
    wx.request({
      url: options.startUrl || options.url,
      method: "POST",
      timeout: READING_REQUEST_TIMEOUT_MS,
      header: options.header,
      data: options.data,
      success: resolve,
      fail: (error) => {
        if (attemptsRemaining > 1) {
          if (typeof options.onRetry === "function") {
            options.onRetry(error);
          }

          setTimeout(() => {
            startReadingRequest(options, attemptsRemaining - 1).then(resolve).catch(reject);
          }, READING_RETRY_DELAY_MS);
          return;
        }

        reject(error);
      }
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

      wx.request({
        url: options.statusUrl,
        method: "GET",
        timeout: READING_REQUEST_TIMEOUT_MS,
        header: {
          Authorization: options.header.Authorization
        },
        success: (response) => {
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
        },
        fail: () => {
          pollReadingStatus(options, startedAt, READING_POLL_DELAY_MS, recoveryStartsRemaining).then(resolve).catch(reject);
        }
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

function createReadingStatusUrl(readingEndpoint, requestId) {
  return `${readingEndpoint.replace(/\/readings$/, "/readings/status")}?requestId=${encodeURIComponent(requestId)}`;
}

function createRequestId() {
  return `reading-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createClosedWheelState() {
  return {
    isOpen: false,
    rotationDeg: 0,
    activeIndex: 0,
    selectedIndex: -1,
    phase: "idle",
    requiredCount: 0,
    drawnCount: 0,
    currentDrawNumber: 0,
    cardBackSrc: WHEEL_CARD_BACK_SRC,
    revealedCard: null
  };
}

function createOpenWheelState(spread) {
  return {
    isOpen: true,
    rotationDeg: 0,
    activeIndex: 0,
    selectedIndex: -1,
    phase: "choosing",
    requiredCount: spread.positions.length,
    drawnCount: 0,
    currentDrawNumber: 1,
    cardBackSrc: WHEEL_CARD_BACK_SRC,
    revealedCard: null
  };
}

function createWheelCards() {
  return shuffle(tarotDeck.slice()).map((card, index) => {
    const orientation = Math.random() >= 0.5 ? "upright" : "reversed";
    const keywords = orientation === "upright" ? card.uprightMeanings : card.reversedMeanings;

    return {
      id: `wheel-${index}-${card.id}`,
      cardId: card.id,
      name: card.name,
      arcana: card.arcana,
      imageSrc: getCardFacePath(card.id),
      uprightMeanings: card.uprightMeanings,
      reversedMeanings: card.reversedMeanings,
      orientation,
      orientationLabel: formatOrientation(orientation),
      keywords,
      drawn: false,
      style: createWheelCardStyle(index)
    };
  });
}

function createWheelCardStyle(index) {
  return `transform: translate(-50%, -50%) rotate(${WHEEL_ACTIVE_ANGLE_DEG + index * WHEEL_STEP_DEG}deg) translateY(-${WHEEL_RADIUS_RPX}rpx);`;
}

function confirmWheelCard(page, index) {
  const slot = page.data.wheelCards[index];

  if (!slot || slot.drawn) {
    return;
  }

  const drawnCards = page.data.drawnCards.slice();
  const position = page.data.selectedSpread.positions[drawnCards.length];
  const drawnCard = createDrawnCardFromWheelSlot(slot, position);
  const wheelCards = markWheelCardDrawn(page.data.wheelCards, index);
  const nextDrawnCards = drawnCards.concat(drawnCard);
  const isComplete = nextDrawnCards.length >= page.data.wheel.requiredCount;
  const nextActiveIndex = isComplete ? index : findNearestAvailableIndex(wheelCards, index + 1);

  page.setData({
    drawnCards: nextDrawnCards,
    wheelCards,
    wheel: Object.assign({}, page.data.wheel, {
      rotationDeg: -nextActiveIndex * WHEEL_STEP_DEG,
      activeIndex: nextActiveIndex,
      selectedIndex: index,
      phase: "revealing",
      drawnCount: nextDrawnCards.length,
      currentDrawNumber: Math.min(nextDrawnCards.length, page.data.wheel.requiredCount),
      revealedCard: drawnCard
    })
  });

  setTimeout(() => {
    if (isComplete) {
      page.setData({
        wheel: createClosedWheelState()
      });
      page.interpretReading();
      return;
    }

    page.setData({
      wheel: Object.assign({}, page.data.wheel, {
        selectedIndex: -1,
        phase: "choosing",
        currentDrawNumber: nextDrawnCards.length + 1,
        revealedCard: null
      })
    });
  }, WHEEL_REVEAL_DELAY_MS);
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

function formatOAuthStatus(session) {
  if (cloudAIEnabled) {
    return canUseBackend(session) ? "已连接混元 · 备用后端已就绪" : "已连接混元";
  }

  if (!session) {
    return "未连接";
  }

  if (session.openaiConfigured === false) {
    return `${session.label} · 模型密钥缺失`;
  }

  return session.label;
}

function formatBackendStatus() {
  if (cloudAIEnabled) {
    return `${appConfig.cloudAI.model} · ${appConfig.cloudAI.envId}`;
  }

  return appConfig.oauth.readingEndpoint.replace(/\/readings$/, "");
}

function formatReadingError(errorMessage) {
  if (errorMessage && errorMessage.indexOf("bearer token") !== -1) {
    return "后端已连接，但服务器尚未配置 AI 提供方令牌。";
  }

  return errorMessage || "AI 解读失败。";
}

function formatProviderError(error) {
  const message = error && (error.message || error.errMsg);

  if (message) {
    return `无法生成 AI 解读：${message}。`;
  }

  return "无法生成 AI 解读。";
}

function formatOrientation(orientation) {
  return orientation === "reversed" ? "逆位" : "正位";
}

function getCardFacePath(cardId) {
  return cardFaceFileOverrides[cardId] || `/images/${cardId.replace(/_/g, "")}.jpeg`;
}

function shuffle(cards) {
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
  }

  return cards;
}
