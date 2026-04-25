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
  const safeQuestion = question.trim() || "what you need to understand today";
  const primaryThemes = drawnCards.map((drawn) => drawn.keywords[0]).join(", ");

  return {
    schemaVersion: READING_SCHEMA_VERSION,
    sourceLabel: sourceLabel || "Prototype OAuth Demo",
    summary: `For ${safeQuestion}, this ${spread.title.toLowerCase()} spread suggests looking at the pattern beneath the situation before choosing your next step.`,
    cards: drawnCards.map((drawn) => ({
      id: drawn.id,
      position: drawn.position,
      name: drawn.card.name,
      orientation: drawn.orientation,
      keywords: drawn.keywords,
      interpretation: `${drawn.card.name} in ${drawn.orientation} orientation points toward ${drawn.keywords.join(", ")}. In the ${drawn.position.toLowerCase()} position, treat this as a symbol to reflect on rather than a fixed prediction.`
    })),
    overallMessage: `The shared thread is ${primaryThemes}. Notice where your attention tightens, because that is likely where the reading has something useful to offer.`,
    practicalReflection:
      "Choose one small, reversible action that honors the clearest card in the spread. Avoid using the reading as medical, legal, financial, or emergency advice.",
    journalQuestion: `What would change if you approached ${safeQuestion} with more honesty, patience, and room for uncertainty?`,
    caveat:
      "This prototype keeps the reading reflective. For medical, legal, financial, or emergency questions, consult a qualified professional."
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

module.exports = {
  READING_SCHEMA_VERSION,
  createFallbackReading,
  createReadingRequest,
  normalizeReading,
  readingJsonSchema
};
