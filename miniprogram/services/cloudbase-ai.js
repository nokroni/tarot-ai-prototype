const {
  READING_SCHEMA_VERSION,
  createInvalidReadingError
} = require("./reading-schema");
const {
  getLanguageConfig,
  normalizeLanguageCode
} = require("./language");
const { createReaderSourceLabel } = require("../prompts/reader-prompts");
const {
  buildRahdueSectionMessages,
  buildRahdueSynthesisMessages,
  buildReadingMessages
} = require("../prompts/system-prompt");

const RAHDUE_SEQUENTIAL_ATTEMPTS = 2;

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
  const modelName = resolveCloudAIModel(cloudAIConfig, readingRequest);
  const sourceLabel = resolveCloudAISourceLabel(cloudAIConfig, readingRequest);
  const result = await model.streamText({
    data: {
      model: modelName,
      messages: buildReadingMessages({
        sourceLabel,
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

async function createCloudBaseRahdueSequentialReading({ cloudAIConfig, readingRequest, onProgress }) {
  if (!hasCloudBaseAI(cloudAIConfig)) {
    throw new Error("云开发 AI 尚未配置。");
  }

  if (!wx.cloud || !wx.cloud.extend || !wx.cloud.extend.AI) {
    throw new Error("当前微信运行环境不可用云开发 AI。");
  }

  const sections = readingRequest &&
    readingRequest.spread &&
    Array.isArray(readingRequest.spread.sections)
    ? readingRequest.spread.sections
    : [];

  if (!sections.length) {
    return createCloudBaseReading({ cloudAIConfig, readingRequest });
  }

  const model = wx.cloud.extend.AI.createModel(cloudAIConfig.provider);
  const modelName = resolveCloudAIModel(cloudAIConfig, readingRequest);
  const sourceLabel = resolveCloudAISourceLabel(cloudAIConfig, readingRequest);
  const completedSections = [];
  const completedCards = [];

  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    const sectionCards = getRahdueSectionCards(readingRequest, section);

    emitRahdueProgress(onProgress, {
      phase: "section",
      current: index + 1,
      total: sections.length + 1,
      sectionTitle: section.title
    });

    const sectionResult = await requestRahdueSectionAttempt({
      model,
      modelName,
      sourceLabel,
      readingRequest,
      section,
      sectionCards,
      previousSections: completedSections,
      attemptNumber: 1
    });

    completedSections.push(sectionResult.section);
    completedCards.push(...sectionResult.cards);
  }

  emitRahdueProgress(onProgress, {
    phase: "synthesis",
    current: sections.length + 1,
    total: sections.length + 1,
    sectionTitle: ""
  });

  const synthesis = await requestRahdueSynthesisAttempt({
    model,
    modelName,
    sourceLabel,
    readingRequest,
    sections: completedSections,
    attemptNumber: 1
  });
  const languageCode = normalizeLanguageCode(readingRequest && readingRequest.language);
  const languageConfig = getLanguageConfig(languageCode);
  const caveat = textOr(synthesis.caveat, languageConfig.fullCaveat);

  return {
    schemaVersion: READING_SCHEMA_VERSION,
    sourceLabel: createReaderSourceLabel(sourceLabel, readingRequest && readingRequest.readerProfile),
    summary: textOr(synthesis.summary, createRahdueFallbackSummary(completedSections, languageCode)),
    sections: completedSections,
    cards: completedCards,
    overallMessage: textOr(synthesis.overallMessage, createRahdueFallbackOverall(completedSections, languageCode)),
    practicalReflection: textOr(synthesis.practicalReflection, createRahdueFallbackPractical(languageCode)),
    journalQuestion: textOr(synthesis.journalQuestion, createRahdueFallbackJournal(languageCode)),
    caveat: caveat.indexOf(languageConfig.safetyCaveat) !== -1 ? caveat : languageConfig.fullCaveat
  };
}

async function requestRahdueSectionAttempt(options) {
  try {
    const sectionResult = await requestRahdueJson({
      model: options.model,
      modelName: options.modelName,
      messages: buildRahdueSectionMessages({
        sourceLabel: options.sourceLabel,
        readingRequest: options.readingRequest,
        section: options.section,
        sectionCards: options.sectionCards,
        previousSections: options.previousSections
      })
    });

    return normalizeRahdueSectionResult(sectionResult, options.section, options.sectionCards);
  } catch (error) {
    if (options.attemptNumber >= RAHDUE_SEQUENTIAL_ATTEMPTS) {
      throw error;
    }

    return requestRahdueSectionAttempt(Object.assign({}, options, {
      attemptNumber: options.attemptNumber + 1
    }));
  }
}

async function requestRahdueSynthesisAttempt(options) {
  try {
    const synthesis = await requestRahdueJson({
      model: options.model,
      modelName: options.modelName,
      messages: buildRahdueSynthesisMessages({
        sourceLabel: options.sourceLabel,
        readingRequest: options.readingRequest,
        sections: options.sections
      })
    });

    return synthesis && typeof synthesis === "object" && !Array.isArray(synthesis)
      ? synthesis
      : {};
  } catch (error) {
    if (options.attemptNumber >= RAHDUE_SEQUENTIAL_ATTEMPTS) {
      throw error;
    }

    return requestRahdueSynthesisAttempt(Object.assign({}, options, {
      attemptNumber: options.attemptNumber + 1
    }));
  }
}

async function requestRahdueJson({ model, modelName, messages }) {
  const result = await model.streamText({
    data: {
      model: modelName,
      messages
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

function normalizeRahdueSectionResult(sectionResult, expectedSection, expectedCards) {
  const result = sectionResult && typeof sectionResult === "object" && !Array.isArray(sectionResult)
    ? sectionResult
    : {};
  const section = result.section && typeof result.section === "object" && !Array.isArray(result.section)
    ? result.section
    : {};
  const cards = Array.isArray(result.cards) ? result.cards : [];

  if (section.id !== expectedSection.id) {
    throw createInvalidReadingError(`Rahdue 分区 ${expectedSection.title} 返回了错误 id。`);
  }

  if (!textOr(section.interpretation, "")) {
    throw createInvalidReadingError(`Rahdue 分区 ${expectedSection.title} 缺少 interpretation。`);
  }

  if (cards.length !== expectedCards.length) {
    throw createInvalidReadingError(`Rahdue 分区 ${expectedSection.title} cards 数量不匹配。`);
  }

  const normalizedCards = cards.map((card, index) => {
    const expectedCard = expectedCards[index];

    if (!card || card.id !== expectedCard.id || !textOr(card.interpretation, "")) {
      throw createInvalidReadingError(`Rahdue 分区 ${expectedSection.title} 第 ${index + 1} 张牌无效。`);
    }

    return {
      id: expectedCard.id,
      interpretation: card.interpretation
    };
  });

  return {
    section: {
      id: expectedSection.id,
      title: textOr(section.title, expectedSection.title),
      interpretation: section.interpretation,
      keyCards: Array.isArray(section.keyCards) ? section.keyCards : []
    },
    cards: normalizedCards
  };
}

function getRahdueSectionCards(readingRequest, section) {
  const cards = readingRequest && Array.isArray(readingRequest.drawnCards)
    ? readingRequest.drawnCards
    : [];

  return cards.slice(section.start - 1, section.end);
}

function emitRahdueProgress(onProgress, progress) {
  if (typeof onProgress === "function") {
    onProgress(progress);
  }
}

function createRahdueFallbackSummary(sections, language) {
  const firstTitle = sections && sections[0] && sections[0].title;

  return normalizeLanguageCode(language) === "en"
    ? `Rahdue's Wheel has moved through the spread in sequence, beginning with ${firstTitle || "the inner wheel"} and gathering the past-life pattern into one symbolic map.`
    : `拉杜之轮已经按顺序走完整个牌阵，从${firstTitle || "内轮"}开始，把前世洞见与当下模式汇成一张象征地图。`;
}

function createRahdueFallbackOverall(sections, language) {
  const sectionTitles = (sections || []).slice(0, 3).map((section) => section.title).filter(Boolean).join(normalizeLanguageCode(language) === "en" ? ", " : "、");

  return normalizeLanguageCode(language) === "en"
    ? `The strongest thread gathers around ${sectionTitles || "the completed sections"}; treat it as inner wisdom to sit with, not a fixed verdict.`
    : `最强的线索集中在${sectionTitles || "已完成的分区"}；请把它当作值得静坐消化的内在智慧，而不是固定判决。`;
}

function createRahdueFallbackPractical(language) {
  return normalizeLanguageCode(language) === "en"
    ? "Let the wheel remain as a quiet mirror of the pattern that asked to be seen."
    : "让这只轮盘安静地停留为一面镜子，照见此刻请求被看见的模式。";
}

function createRahdueFallbackJournal(language) {
  return normalizeLanguageCode(language) === "en"
    ? "Which section felt most familiar before you tried to explain it?"
    : "哪一个分区在你解释它之前，就已经让你觉得熟悉？";
}

function textOr(value, fallback) {
  return typeof value === "string" && value.trim() ? value : fallback || "";
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

function resolveCloudAIModel(cloudAIConfig, readingRequest) {
  const spreadId = getReadingSpreadId(readingRequest);
  const overrides = cloudAIConfig && cloudAIConfig.modelOverrides;

  return overrides && overrides[spreadId]
    ? overrides[spreadId]
    : cloudAIConfig.model;
}

function resolveCloudAISourceLabel(cloudAIConfig, readingRequest) {
  const spreadId = getReadingSpreadId(readingRequest);
  const overrides = cloudAIConfig && cloudAIConfig.sourceLabelOverrides;

  return overrides && overrides[spreadId]
    ? overrides[spreadId]
    : (cloudAIConfig.sourceLabel || "HY");
}

function getReadingSpreadId(readingRequest) {
  return readingRequest &&
    readingRequest.spread &&
    readingRequest.spread.id;
}

module.exports = {
  createCloudBaseReading,
  createCloudBaseRahdueSequentialReading,
  hasCloudBaseAI,
  resolveCloudAIModel,
  resolveCloudAISourceLabel
};
