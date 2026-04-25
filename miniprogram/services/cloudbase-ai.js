const { READING_SCHEMA_VERSION } = require("./reading-schema");

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
        sourceLabel: cloudAIConfig.sourceLabel || "腾讯混元",
        readingRequest
      })
    }
  });
  const outputText = await collectStreamText(result);

  if (!outputText) {
    throw new Error("云开发 AI 返回了空解读。");
  }

  try {
    return JSON.parse(extractJsonObject(outputText));
  } catch (error) {
    throw new Error("云开发 AI 返回的解读 JSON 无效。");
  }
}

function createMessages({ sourceLabel, readingRequest }) {
  return [
    {
      role: "system",
      content: [
        "You write reflective tarot readings for a WeChat Mini Program.",
        "Return exactly one valid JSON object and no markdown, prose, or code fences.",
        `The JSON schemaVersion must be \"${READING_SCHEMA_VERSION}\" and sourceLabel must be \"${sourceLabel}\".`,
        "Required top-level keys: schemaVersion, sourceLabel, summary, cards, overallMessage, practicalReflection, journalQuestion, caveat.",
        "The cards array must contain exactly one item for each drawnCards item in the request.",
        "For each card, copy id, position, name, orientation, and keywords from the drawnCards item, then add interpretation.",
        "The app has already drawn the cards. Do not replace, redraw, remove, or invent cards.",
        "所有面向用户的文字字段必须使用简体中文，包括 summary、cards[].interpretation、overallMessage、practicalReflection、journalQuestion、caveat。",
        "字段名仍使用英文 JSON key，不要翻译 schemaVersion、sourceLabel、cards 等键名。",
        "语气温和、克制、具体、有帮助。",
        "Avoid certainty, fortune telling, or professional medical, legal, financial, or emergency advice."
      ].join(" ")
    },
    {
      role: "user",
      content: `Create a structured tarot reading for this request:\n${JSON.stringify(readingRequest, null, 2)}`
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
