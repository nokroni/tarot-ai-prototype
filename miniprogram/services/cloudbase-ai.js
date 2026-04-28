const {
  READING_SCHEMA_VERSION,
  createInvalidReadingError,
  readingDirectionPromptGuidance
} = require("./reading-schema");
const {
  getLanguageConfig,
  normalizeLanguageCode
} = require("./language");
const {
  createReaderPromptGuidance,
  createReaderSourceLabel
} = require("./reader-profiles");

function hasCloudBaseAI(cloudAIConfig) {
  return Boolean(
    cloudAIConfig &&
      cloudAIConfig.enabled !== false &&
      cloudAIConfig.envId &&
      cloudAIConfig.provider &&
      cloudAIConfig.model
  );
}

async function createCloudBaseReading({ cloudAIConfig, readingRequest }) {
  if (!hasCloudBaseAI(cloudAIConfig)) {
    throw new Error("云开发 AI 尚未配置。");
  }

  if (!wx.cloud || !wx.cloud.extend || !wx.cloud.extend.AI) {
    throw new Error("当前微信运行环境不可用云开发 AI。");
  }

  const model = wx.cloud.extend.AI.createModel(cloudAIConfig.provider);
  const result = await model.streamText({
    data: {
      model: cloudAIConfig.model,
      messages: createMessages({
        sourceLabel: cloudAIConfig.sourceLabel || "HY",
        readingRequest
      })
    }
  });
  const outputText = await collectStreamText(result);

  if (!outputText) {
    throw createInvalidReadingError("云开发 AI 返回了空解读。");
  }

  try {
    return JSON.parse(extractJsonObject(outputText));
  } catch (error) {
    throw createInvalidReadingError("云开发 AI 返回的解读 JSON 无效。");
  }
}

function createMessages({ sourceLabel, readingRequest }) {
  const readerProfile = readingRequest && readingRequest.readerProfile;
  const languageCode = normalizeLanguageCode(readingRequest && readingRequest.language);
  const languageConfig = getLanguageConfig(languageCode);
  const outputSourceLabel = createReaderSourceLabel(sourceLabel, readerProfile);
  const zhOutputRules = [
    "所有面向用户的文字字段必须使用自然简体中文，包括 summary、cards[].interpretation、overallMessage、practicalReflection、journalQuestion、caveat。",
    "正文里提到牌面方向时，只使用 drawnCards[].orientationText 提供的“正位/逆位”；orientation 只是内部字段，除了复制到 cards[].orientation 之外，不要写进正文。",
    "caveat 必须包含这句话：AI生成内容，仅供娱乐和自我反思。"
  ];
  const enOutputRules = [
    "All user-facing string values must be natural English, including summary, cards[].interpretation, overallMessage, practicalReflection, journalQuestion, and caveat.",
    "When mentioning card orientation in prose, use drawnCards[].orientationText, which will be Upright or Reversed for this request; orientation is an internal enum and should only be copied to cards[].orientation.",
    "Do not write Chinese UI phrases or Chinese prompt terms in the user-facing fields.",
    "caveat must include this exact phrase: AI-generated content, for entertainment and self-reflection only."
  ];

  return [
    {
      role: "system",
      content: [
        languageCode === "en"
          ? "You write restrained, reflective tarot readings for a WeChat mini program."
          : "你为微信小程序撰写克制、反思性的塔罗解读。",
        "只返回一个有效 JSON 对象，不要输出 markdown、解释文字或代码块。",
        `JSON 的 schemaVersion 必须是 \"${READING_SCHEMA_VERSION}\"，sourceLabel 必须是 \"${outputSourceLabel}\"。`,
        "顶层 key 必须包含 schemaVersion、sourceLabel、summary、cards、overallMessage、practicalReflection、journalQuestion、caveat。",
        "cards 数组必须与请求里的 drawnCards 一一对应。",
        "每张牌必须从 drawnCards 复制 id、position、name、orientation、keywords，再补充 interpretation。",
        "应用已经完成抽牌。不要替换、重抽、删除或编造牌。",
        `The selected output language is ${languageConfig.outputLanguage}.`,
        ...(languageCode === "en" ? enOutputRules : zhOutputRules),
        "不要把内部字段名、枚举值、英文提示词术语或 JSON 说明写进面向用户的句子。",
        "字段名仍使用英文 JSON key，不要翻译 schemaVersion、sourceLabel、cards 等键名。",
        createReaderPromptGuidance(readerProfile, languageCode),
        readingDirectionPromptGuidance(languageCode),
        "避免确定性预言，也不要提供医疗、法律、财务或紧急事务专业建议。"
      ].join(" ")
    },
    {
      role: "user",
      content: `${languageCode === "en" ? "Generate a structured tarot reading from this request:" : "请按这个请求生成结构化塔罗解读："}\n${JSON.stringify(readingRequest, null, 2)}`
    }
  ];
}

async function collectStreamText(result) {
  let outputText = "";

  if (result && result.eventStream) {
    for await (const event of result.eventStream) {
      if (!event || event.data === "[DONE]") {
        break;
      }

      const data = parseEventData(event.data);
      const text =
        data &&
        data.choices &&
        data.choices[0] &&
        data.choices[0].delta &&
        data.choices[0].delta.content;

      if (typeof text === "string") {
        outputText += text;
      }
    }
  }

  if (!outputText && result && result.textStream) {
    for await (const text of result.textStream) {
      if (typeof text === "string") {
        outputText += text;
      }
    }
  }

  return outputText.trim();
}

function parseEventData(data) {
  if (!data) {
    return null;
  }

  if (typeof data === "object") {
    return data;
  }

  try {
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

function extractJsonObject(text) {
  const trimmed = String(text || "").trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    return extractJsonObject(fenced[1]);
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

module.exports = {
  createCloudBaseReading,
  hasCloudBaseAI
};
