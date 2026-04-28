const { createInvalidReadingError } = require("./reading-schema");
const { buildReadingMessages } = require("../prompts/system-prompt");

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
      messages: buildReadingMessages({
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
