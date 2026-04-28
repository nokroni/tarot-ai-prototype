const {
  getLanguageConfig,
  normalizeLanguageCode
} = require("../services/language");
const { READING_SCHEMA_VERSION } = require("../services/reading-schema");
const {
  createReaderPromptGuidance,
  createReaderSourceLabel
} = require("./reader-prompts");
const { readingDirectionPromptGuidance } = require("./reading-direction");
const { buildConditionalGuidance } = require("./conditional-rules");

function buildReadingMessages({ sourceLabel, readingRequest }) {
  const readerProfile = readingRequest && readingRequest.readerProfile;
  const languageCode = normalizeLanguageCode(readingRequest && readingRequest.language);
  const languageConfig = getLanguageConfig(languageCode);
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
    "顶层 key 必须包含 schemaVersion、sourceLabel、summary、cards、overallMessage、practicalReflection、journalQuestion、caveat；JSON key 一律保留英文，不要翻译。",
    "cards 数组每项只输出 id 与 interpretation 两个字段：id 必须与 drawnCards[].id 顺序对应且完全一致，interpretation 是这张牌在该牌位、正逆位下针对用户问题的解读。drawnCards 里 position、name、orientation、keywords 等元数据是输入参考，请勿在 cards[] 里复制或回显。",
    "应用已经完成抽牌。不要替换、重抽、删除或编造牌。",
    `The selected output language is ${languageConfig.outputLanguage}.`,
    ...outputRules,
    "不要把内部字段名、枚举值、英文提示词术语或 JSON 说明写进面向用户的句子。",
    createReaderPromptGuidance(readerProfile, languageCode),
    readingDirectionPromptGuidance(languageCode),
    conditionalGuidance,
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
    "所有面向用户的文字字段必须使用自然简体中文，包括 summary、cards[].interpretation、overallMessage、practicalReflection、journalQuestion、caveat。",
    "正文里提到牌面方向时，只使用 drawnCards[].orientationText 提供的“正位/逆位”；不要把 orientation、keywords 这类英文字段名写进正文。",
    "caveat 必须包含这句话：AI生成内容，仅供娱乐和自我反思。"
  ];
}

function buildEnglishOutputRules() {
  return [
    "All user-facing string values must be natural English, including summary, cards[].interpretation, overallMessage, practicalReflection, journalQuestion, and caveat.",
    "When mentioning card orientation in prose, use drawnCards[].orientationText, which will be Upright or Reversed for this request; do not write internal field names like orientation or keywords into the prose.",
    "Do not write Chinese UI phrases or Chinese prompt terms in the user-facing fields.",
    "caveat must include this exact phrase: AI-generated content, for entertainment and self-reflection only."
  ];
}

module.exports = {
  buildReadingMessages
};
