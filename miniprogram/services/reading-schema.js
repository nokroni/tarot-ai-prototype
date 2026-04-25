const READING_SCHEMA_VERSION = "tarot.reading.v1";

function normalizeReading(rawReading, fallbackReading) {
  const reading = rawReading && typeof rawReading === "object" ? rawReading : {};
  const fallback = fallbackReading || {};
  const cards = Array.isArray(reading.cards) && reading.cards.length ? reading.cards : fallback.cards || [];

  return {
    schemaVersion: reading.schemaVersion || READING_SCHEMA_VERSION,
    sourceLabel: reading.sourceLabel || fallback.sourceLabel || "Prototype",
    summary: textOr(reading.summary, fallback.summary),
    cards: cards.map((card, index) => ({
      id: textOr(card.id, `card-${index}`),
      position: textOr(card.position, "Card"),
      name: textOr(card.name, "Unknown card"),
      orientation: textOr(card.orientation, "upright"),
      orientationText: formatOrientation(card.orientation),
      keywords: Array.isArray(card.keywords) ? card.keywords : [],
      keywordsText: Array.isArray(card.keywords) ? card.keywords.join(", ") : "",
      interpretation: textOr(card.interpretation, card.text || "")
    })),
    overallMessage: textOr(reading.overallMessage, fallback.overallMessage),
    practicalReflection: textOr(reading.practicalReflection, fallback.practicalReflection),
    journalQuestion: textOr(reading.journalQuestion, fallback.journalQuestion),
    caveat: textOr(
      reading.caveat,
      fallback.caveat ||
        "Tarot readings are for reflection and entertainment, not professional advice or certain predictions."
    )
  };
}

function createFallbackReading({ question, spread, drawnCards, sourceLabel }) {
  const safeQuestion = question.trim() || "今天需要理解的事情";
  const primaryThemes = drawnCards.map((drawn) => drawn.keywords[0]).join(", ");

  return {
    schemaVersion: READING_SCHEMA_VERSION,
    sourceLabel: sourceLabel || "Prototype OAuth Demo",
    summary: `关于“${safeQuestion}”，这个牌阵提示你先看清局面背后的模式，再决定下一步。`,
    cards: drawnCards.map((drawn) => ({
      id: drawn.id,
      position: drawn.position,
      name: drawn.card.name,
      orientation: drawn.orientation,
      keywords: drawn.keywords,
      interpretation: `${drawn.card.name}以${drawn.orientation}方向出现，关键词是${drawn.keywords.join("、")}。在“${drawn.position}”位置上，它更适合作为反思的象征，而不是固定的预言。`
    })),
    overallMessage: `这些牌共同指向：${primaryThemes}。留意你最紧绷、最在意的地方，那里可能正是这次解读真正有用的位置。`,
    practicalReflection:
      "选择一个小而可逆的行动，回应牌阵里最清楚的提醒。不要把本解读当作医疗、法律、财务或紧急事务建议。",
    journalQuestion: `如果你带着更多诚实、耐心和不确定性的空间来看待“${safeQuestion}”，会有什么改变？`,
    caveat:
      "这个原型只提供反思性解读。涉及医疗、法律、财务或紧急问题时，请咨询合格专业人士。"
  };
}

function createReadingRequest({ question, spread, drawnCards }) {
  return {
    schemaVersion: READING_SCHEMA_VERSION,
    question: question.trim() || "No specific question was provided.",
    spread: {
      id: spread.id,
      title: spread.title,
      positions: spread.positions
    },
    drawnCards: drawnCards.map((drawn) => ({
      id: drawn.id,
      position: drawn.position,
      name: drawn.card.name,
      arcana: drawn.card.arcana,
      orientation: drawn.orientation,
      keywords: drawn.keywords
    }))
  };
}

function readingJsonSchema() {
  return {
    type: "json_schema",
    name: "tarot_reading",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "schemaVersion",
        "sourceLabel",
        "summary",
        "cards",
        "overallMessage",
        "practicalReflection",
        "journalQuestion",
        "caveat"
      ],
      properties: {
        schemaVersion: {
          type: "string",
          enum: [READING_SCHEMA_VERSION]
        },
        sourceLabel: {
          type: "string"
        },
        summary: {
          type: "string"
        },
        cards: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "position", "name", "orientation", "keywords", "interpretation"],
            properties: {
              id: {
                type: "string"
              },
              position: {
                type: "string"
              },
              name: {
                type: "string"
              },
              orientation: {
                type: "string",
                enum: ["upright", "reversed"]
              },
              keywords: {
                type: "array",
                items: {
                  type: "string"
                }
              },
              interpretation: {
                type: "string"
              }
            }
          }
        },
        overallMessage: {
          type: "string"
        },
        practicalReflection: {
          type: "string"
        },
        journalQuestion: {
          type: "string"
        },
        caveat: {
          type: "string"
        }
      }
    }
  };
}

function textOr(value, fallback) {
  return typeof value === "string" && value.trim() ? value : fallback || "";
}

function formatOrientation(orientation) {
  return orientation === "reversed" ? "逆位" : "正位";
}

module.exports = {
  READING_SCHEMA_VERSION,
  createFallbackReading,
  createReadingRequest,
  normalizeReading,
  readingJsonSchema
};
