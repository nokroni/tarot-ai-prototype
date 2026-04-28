const {
  getLanguageConfig,
  normalizeLanguageCode
} = require("../services/language");
const { READING_SCHEMA_VERSION } = require("../services/reading-schema");
const {
  createReaderPromptGuidance,
  createReaderSourceLabel
} = require("./reader-prompts");
const { RAHDUE_SPREAD_ID } = require("../services/reading-options");
const { readingDirectionPromptGuidance } = require("./reading-direction");
const { buildConditionalGuidance } = require("./conditional-rules");

function buildReadingMessages({ sourceLabel, readingRequest }) {
  const readerProfile = readingRequest && readingRequest.readerProfile;
  const languageCode = normalizeLanguageCode(readingRequest && readingRequest.language);
  const languageConfig = getLanguageConfig(languageCode);
  const isRahdueReading = readingRequest &&
    readingRequest.spread &&
    readingRequest.spread.id === RAHDUE_SPREAD_ID;
  const outputSourceLabel = createReaderSourceLabel(sourceLabel, readerProfile);
  const outputRules = languageCode === "en"
    ? buildEnglishOutputRules()
    : buildChineseOutputRules();
  const conditionalGuidance = buildConditionalGuidance(
    {
      questionFocus: readingRequest && readingRequest.questionFocus,
      questionScale: readingRequest && readingRequest.questionScale,
      answerGuidance: readingRequest && readingRequest.answerGuidance
    },
    languageCode
  );
  const systemSegments = [
    languageCode === "en"
      ? "You write restrained, reflective tarot readings for a WeChat mini program."
      : "你为微信小程序撰写克制、反思性的塔罗解读。",
    "只返回一个有效 JSON 对象，不要输出 markdown、解释文字或代码块。",
    `JSON 的 schemaVersion 必须是 \"${READING_SCHEMA_VERSION}\"，sourceLabel 必须是 \"${outputSourceLabel}\"。`,
    isRahdueReading
      ? "顶层 key 必须包含 schemaVersion、sourceLabel、summary、sections、cards、overallMessage、practicalReflection、journalQuestion、caveat；JSON key 一律保留英文，不要翻译。"
      : "顶层 key 必须包含 schemaVersion、sourceLabel、summary、cards、overallMessage、practicalReflection、journalQuestion、caveat；JSON key 一律保留英文，不要翻译。",
    "cards 数组每项只输出 id 与 interpretation 两个字段：id 必须与 drawnCards[].id 顺序对应且完全一致，interpretation 是这张牌在该牌位、正逆位下针对用户问题的解读。drawnCards 里 position、name、orientation、keywords 等元数据是输入参考，请勿在 cards[] 里复制或回显。",
    "应用已经完成抽牌。不要替换、重抽、删除或编造牌。",
    `The selected output language is ${languageConfig.outputLanguage}.`,
    ...outputRules,
    "不要把内部字段名、枚举值、英文提示词术语或 JSON 说明写进面向用户的句子。",
    createReaderPromptGuidance(readerProfile, languageCode),
    readingDirectionPromptGuidance(languageCode),
    conditionalGuidance,
    isRahdueReading
      ? createRahduePromptGuidance(languageCode)
      : "",
    "避免确定性预言，也不要提供医疗、法律、财务或紧急事务专业建议。"
  ].filter((segment) => typeof segment === "string" && segment.length > 0);

  const userPayload = serializeReadingRequest(readingRequest);
  const userIntro = languageCode === "en"
    ? "Generate a structured tarot reading from this request:"
    : "请按这个请求生成结构化塔罗解读：";

  return [
    {
      role: "system",
      content: systemSegments.join(" ")
    },
    {
      role: "user",
      content: `${userIntro}\n${JSON.stringify(userPayload, null, 2)}`
    }
  ];
}

function buildRahdueSectionMessages({ sourceLabel, readingRequest, section, sectionCards, previousSections }) {
  const readerProfile = readingRequest && readingRequest.readerProfile;
  const languageCode = normalizeLanguageCode(readingRequest && readingRequest.language);
  const languageConfig = getLanguageConfig(languageCode);
  const outputSourceLabel = createReaderSourceLabel(sourceLabel, readerProfile);
  const previous = Array.isArray(previousSections) ? previousSections : [];
  const systemSegments = [
    languageCode === "en"
      ? "You are reading one sequential section of Rahdue's Wheel for a WeChat mini program."
      : "你正在为微信小程序按顺序解读拉杜之轮的一个分区。",
    "只返回一个有效 JSON 对象，不要输出 markdown、解释文字或代码块。",
    "JSON 顶层必须只包含 section 与 cards。",
    "section 必须包含 id、title、interpretation、keyCards。cards 数组每项只输出 id 与 interpretation。",
    "cards[].id 必须与本分区 drawnCards[].id 顺序对应且完全一致。不要替换、重抽、删除或编造牌。",
    `Source label context: ${outputSourceLabel}.`,
    `The selected output language is ${languageConfig.outputLanguage}.`,
    languageCode === "en"
      ? "Write each card interpretation as one concise but complete sentence; do not truncate with ellipses."
      : "每张牌写成一句简洁但完整的话；不要用省略号截断。",
    languageCode === "en"
      ? "This is symbolic past-life insight and inner wisdom, not certain past-life fact or professional advice."
      : "这是象征性的前世洞见与内在智慧探索，不是确定前世事实或专业建议。",
    createReaderPromptGuidance(readerProfile, languageCode)
  ].filter((segment) => typeof segment === "string" && segment.length > 0);
  const userPayload = {
    schemaVersion: readingRequest && readingRequest.schemaVersion,
    language: readingRequest && readingRequest.language,
    question: readingRequest && readingRequest.question,
    spread: {
      id: readingRequest && readingRequest.spread && readingRequest.spread.id,
      title: readingRequest && readingRequest.spread && readingRequest.spread.title
    },
    currentSection: section,
    previousSections: previous.map((item) => ({
      id: item.id,
      title: item.title,
      interpretation: item.interpretation
    })),
    readerProfile,
    drawnCards: sectionCards
  };
  const userIntro = languageCode === "en"
    ? "Read this Rahdue section in sequence:"
    : "请按顺序解读这个拉杜之轮分区：";

  return [
    {
      role: "system",
      content: systemSegments.join(" ")
    },
    {
      role: "user",
      content: `${userIntro}\n${JSON.stringify(userPayload, null, 2)}`
    }
  ];
}

function buildRahdueSynthesisMessages({ sourceLabel, readingRequest, sections }) {
  const readerProfile = readingRequest && readingRequest.readerProfile;
  const languageCode = normalizeLanguageCode(readingRequest && readingRequest.language);
  const languageConfig = getLanguageConfig(languageCode);
  const outputSourceLabel = createReaderSourceLabel(sourceLabel, readerProfile);
  const systemSegments = [
    languageCode === "en"
      ? "You are writing the final synthesis for a sequential Rahdue's Wheel reading."
      : "你正在为按顺序完成的拉杜之轮解读写最终综合。",
    "只返回一个有效 JSON 对象，不要输出 markdown、解释文字或代码块。",
    "JSON 顶层必须只包含 summary、overallMessage、practicalReflection、journalQuestion、caveat。",
    `sourceLabel context is ${outputSourceLabel}, but do not include sourceLabel in this partial JSON.`,
    `The selected output language is ${languageConfig.outputLanguage}.`,
    languageCode === "en"
      ? "Do not provide a user-facing Action reminder. practicalReflection is schema compatibility only: write one quiet closing observation, not an action step."
      : "不要提供面向用户显示的“行动提醒”。practicalReflection 只为 schema 兼容保留，写成一句安静的收束观察，不要写行动建议。",
    languageCode === "en"
      ? "Frame Rahdue's Wheel as symbolic past-life insight and inner wisdom, never certain past-life fact."
      : "把拉杜之轮写成象征性的前世洞见与内在智慧探索，不要写成确定前世事实。",
    createReaderPromptGuidance(readerProfile, languageCode)
  ].filter((segment) => typeof segment === "string" && segment.length > 0);
  const userPayload = {
    schemaVersion: readingRequest && readingRequest.schemaVersion,
    language: readingRequest && readingRequest.language,
    question: readingRequest && readingRequest.question,
    spread: readingRequest && readingRequest.spread,
    readerProfile,
    sections
  };
  const userIntro = languageCode === "en"
    ? "Synthesize these completed Rahdue sections:"
    : "请综合这些已完成的拉杜之轮分区：";

  return [
    {
      role: "system",
      content: systemSegments.join(" ")
    },
    {
      role: "user",
      content: `${userIntro}\n${JSON.stringify(userPayload, null, 2)}`
    }
  ];
}

function createRahduePromptGuidance(language) {
  const languageCode = normalizeLanguageCode(language);

  if (languageCode === "en") {
    return "This is highly experimental and unstable; do not present it as certain prediction, past-life fact, medical/legal/financial guidance, or authoritative Rahdue doctrine. Treat Rahdue’s Wheel here as a dedicated digital reading template inspired by public Rahdue notes for symbolic past-life insight and inner wisdom: a canvas-like wheel layout, one main summary, one sections[] entry per spread.sections item, all 78 cards[] in drawnCards order, and one overallMessage. Each cards[].interpretation must be one very short line. The reading page does not display an Action reminder for Rahdue; practicalReflection exists only for schema compatibility and must be a quiet closing observation, not an action step.";
  }

  return "This is highly experimental and unstable; do not present it as certain prediction, past-life fact, medical/legal/financial guidance, or authoritative Rahdue doctrine. Rahdue’s Wheel 在这里属于高度实验且不稳定的数字化专用阅读模板，用于象征性探索前世洞见与内在智慧；不得把它写成确定预言、前世事实、医疗/法律/财务建议，或权威 Rahdue 教义。按 Layered Summary 输出：阅读页会显示轮盘式 canvas、summary 主线、sections[] 分区层级、完整 78 张 cards[] 和 overallMessage。cards[] 必须覆盖全部 78 张并与 drawnCards 顺序一致，但每张 interpretation 只能是一条很短的提示；主要分析放在 sections[]，每个 spread.sections 分区输出 id、title、interpretation、keyCards。Rahdue 阅读页不显示“行动提醒”；practicalReflection 只为 schema 兼容保留，必须写成一句安静的收束观察，不要写行动建议。";
}

function serializeReadingRequest(readingRequest) {
  if (!readingRequest || typeof readingRequest !== "object") {
    return readingRequest;
  }

  return {
    schemaVersion: readingRequest.schemaVersion,
    language: readingRequest.language,
    question: readingRequest.question,
    spread: readingRequest.spread,
    decisionOptions: readingRequest.decisionOptions,
    spreadGuidance: readingRequest.spreadGuidance,
    readerProfile: readingRequest.readerProfile,
    drawnCards: readingRequest.drawnCards
  };
}

function buildChineseOutputRules() {
  return [
    "所有面向用户的文字字段必须使用自然简体中文，包括 summary、sections[].title、sections[].interpretation、cards[].interpretation、overallMessage、practicalReflection、journalQuestion、caveat。",
    "正文里提到牌面方向时，只使用 drawnCards[].orientationText 提供的“正位/逆位”；不要把 orientation、keywords 这类英文字段名写进正文。",
    "caveat 必须包含这句话：AI生成内容，仅供娱乐和自我反思。"
  ];
}

function buildEnglishOutputRules() {
  return [
    "All user-facing string values must be natural English, including summary, sections[].title, sections[].interpretation, cards[].interpretation, overallMessage, practicalReflection, journalQuestion, and caveat.",
    "When mentioning card orientation in prose, use drawnCards[].orientationText, which will be Upright or Reversed for this request; do not write internal field names like orientation or keywords into the prose.",
    "Do not write Chinese UI phrases or Chinese prompt terms in the user-facing fields.",
    "caveat must include this exact phrase: AI-generated content, for entertainment and self-reflection only."
  ];
}

module.exports = {
  buildRahdueSectionMessages,
  buildRahdueSynthesisMessages,
  buildReadingMessages
};
