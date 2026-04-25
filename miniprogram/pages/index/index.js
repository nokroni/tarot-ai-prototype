const spreads = [
  {
    id: "oneCard",
    title: "One Card",
    positions: ["Guidance"]
  },
  {
    id: "threeCard",
    title: "Three Cards",
    positions: ["Situation", "Challenge", "Advice"]
  }
];

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
];

Page({
  data: {
    question: "",
    spreads,
    selectedSpreadId: "threeCard",
    selectedSpread: spreads[1],
    drawnCards: [],
    interpretation: null,
    errorMessage: ""
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
    const drawnCards = drawCards(this.data.selectedSpread);

    this.setData({
      drawnCards,
      interpretation: null,
      errorMessage: ""
    });
  },

  interpretReading() {
    if (!this.data.drawnCards.length) {
      this.setData({
        errorMessage: "Draw cards first."
      });
      return;
    }

    this.setData({
      interpretation: buildLocalInterpretation(this.data.question, this.data.selectedSpread, this.data.drawnCards),
      errorMessage: ""
    });
  }
});

function drawCards(spread) {
  const deck = shuffle(tarotDeck.slice());

  return spread.positions.map((position, index) => {
    const card = deck[index];
    const orientation = Math.random() >= 0.5 ? "upright" : "reversed";
    const keywords = orientation === "upright" ? card.uprightMeanings : card.reversedMeanings;

    return {
      id: `${card.id}-${position}`,
      card,
      position,
      orientation,
      keywords
    };
  });
}

function shuffle(cards) {
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
  }

  return cards;
}

function buildLocalInterpretation(question, spread, drawnCards) {
  const safeQuestion = question.trim() || "what you need to understand today";
  const cardSummaries = drawnCards.map((drawn) => ({
    id: drawn.id,
    position: drawn.position,
    name: drawn.card.name,
    text: `${drawn.card.name} in ${drawn.orientation} orientation points toward ${drawn.keywords.join(", ")}. In the ${drawn.position.toLowerCase()} position, treat this as a symbol to reflect on rather than a fixed prediction.`
  }));

  return {
    summary: `For ${safeQuestion}, this ${spread.title.toLowerCase()} spread suggests looking at the pattern beneath the situation before choosing your next step.`,
    cards: cardSummaries,
    overall: `The shared thread is ${drawnCards.map((drawn) => drawn.keywords[0]).join(", ")}. Notice where your attention tightens, because that is likely where the reading has something useful to offer.`,
    reflection: "Choose one small, reversible action that honors the clearest card in the spread. Avoid using the reading as medical, legal, financial, or emergency advice.",
    journal: `What would change if you approached ${safeQuestion} with more honesty, patience, and room for uncertainty?`
  };
}
