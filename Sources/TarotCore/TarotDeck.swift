import Foundation

public enum TarotDeck {
  public static let cards: [TarotCard] = [
    TarotCard(
      id: "the_fool",
      name: "The Fool",
      arcana: "Major Arcana",
      uprightMeanings: ["new beginnings", "faith", "spontaneity", "adventure"],
      reversedMeanings: ["recklessness", "hesitation", "naivety", "poor planning"]
    ),
    TarotCard(
      id: "the_magician",
      name: "The Magician",
      arcana: "Major Arcana",
      uprightMeanings: ["manifestation", "skill", "focus", "resourcefulness"],
      reversedMeanings: ["manipulation", "scattered energy", "unused potential"]
    ),
    TarotCard(
      id: "the_high_priestess",
      name: "The High Priestess",
      arcana: "Major Arcana",
      uprightMeanings: ["intuition", "mystery", "inner wisdom", "subconscious"],
      reversedMeanings: ["secrets", "blocked intuition", "confusion"]
    ),
    TarotCard(
      id: "the_empress",
      name: "The Empress",
      arcana: "Major Arcana",
      uprightMeanings: ["abundance", "creativity", "nurturing", "growth"],
      reversedMeanings: ["stagnation", "overgiving", "creative block"]
    ),
    TarotCard(
      id: "the_emperor",
      name: "The Emperor",
      arcana: "Major Arcana",
      uprightMeanings: ["structure", "authority", "discipline", "stability"],
      reversedMeanings: ["control issues", "rigidity", "lack of structure"]
    ),
    TarotCard(
      id: "the_hierophant",
      name: "The Hierophant",
      arcana: "Major Arcana",
      uprightMeanings: ["tradition", "teaching", "community", "shared values"],
      reversedMeanings: ["dogma", "nonconformity", "stale advice", "questioning rules"]
    ),
    TarotCard(
      id: "the_lovers",
      name: "The Lovers",
      arcana: "Major Arcana",
      uprightMeanings: ["choice", "alignment", "relationship", "values"],
      reversedMeanings: ["misalignment", "difficult choice", "imbalance"]
    ),
    TarotCard(
      id: "the_chariot",
      name: "The Chariot",
      arcana: "Major Arcana",
      uprightMeanings: ["momentum", "willpower", "direction", "self-control"],
      reversedMeanings: ["forcefulness", "scattered effort", "stalling", "inner conflict"]
    ),
    TarotCard(
      id: "strength",
      name: "Strength",
      arcana: "Major Arcana",
      uprightMeanings: ["courage", "patience", "compassion", "inner steadiness"],
      reversedMeanings: ["self-doubt", "reactivity", "fatigue", "unprocessed fear"]
    ),
    TarotCard(
      id: "the_hermit",
      name: "The Hermit",
      arcana: "Major Arcana",
      uprightMeanings: ["reflection", "solitude", "discernment", "inner guidance"],
      reversedMeanings: ["isolation", "avoidance", "overthinking", "withdrawal"]
    ),
    TarotCard(
      id: "wheel_of_fortune",
      name: "Wheel of Fortune",
      arcana: "Major Arcana",
      uprightMeanings: ["change", "cycles", "timing", "turning point"],
      reversedMeanings: ["resistance", "setback", "pattern repetition", "instability"]
    ),
    TarotCard(
      id: "justice",
      name: "Justice",
      arcana: "Major Arcana",
      uprightMeanings: ["truth", "accountability", "fairness", "clear consequences"],
      reversedMeanings: ["bias", "avoidance", "unfairness", "unclear facts"]
    ),
    TarotCard(
      id: "the_hanged_man",
      name: "The Hanged Man",
      arcana: "Major Arcana",
      uprightMeanings: ["surrender", "new perspective", "pause", "release"],
      reversedMeanings: ["stagnation", "martyrdom", "delay", "resisting insight"]
    ),
    TarotCard(
      id: "death",
      name: "Death",
      arcana: "Major Arcana",
      uprightMeanings: ["ending", "transition", "renewal", "letting go"],
      reversedMeanings: ["clinging", "fear of change", "unfinished closure", "stasis"]
    ),
    TarotCard(
      id: "temperance",
      name: "Temperance",
      arcana: "Major Arcana",
      uprightMeanings: ["balance", "integration", "moderation", "healing rhythm"],
      reversedMeanings: ["excess", "impatience", "imbalance", "disharmony"]
    ),
    TarotCard(
      id: "the_devil",
      name: "The Devil",
      arcana: "Major Arcana",
      uprightMeanings: ["attachment", "temptation", "shadow patterns", "material focus"],
      reversedMeanings: ["release", "reclaiming power", "breaking patterns", "awareness"]
    ),
    TarotCard(
      id: "the_tower",
      name: "The Tower",
      arcana: "Major Arcana",
      uprightMeanings: ["disruption", "revelation", "breakthrough", "false structure falling"],
      reversedMeanings: ["avoided change", "aftershock", "fear of upheaval", "slow rebuild"]
    ),
    TarotCard(
      id: "the_star",
      name: "The Star",
      arcana: "Major Arcana",
      uprightMeanings: ["hope", "renewal", "inspiration", "gentle trust"],
      reversedMeanings: ["discouragement", "dimmed faith", "disconnect", "needing rest"]
    ),
    TarotCard(
      id: "the_moon",
      name: "The Moon",
      arcana: "Major Arcana",
      uprightMeanings: ["uncertainty", "dreams", "intuition", "hidden feelings"],
      reversedMeanings: ["confusion lifting", "anxiety", "misread signals", "avoidance"]
    ),
    TarotCard(
      id: "the_sun",
      name: "The Sun",
      arcana: "Major Arcana",
      uprightMeanings: ["clarity", "vitality", "joy", "confidence"],
      reversedMeanings: ["muted joy", "overconfidence", "temporary cloudiness", "burnout"]
    ),
    TarotCard(
      id: "judgement",
      name: "Judgement",
      arcana: "Major Arcana",
      uprightMeanings: ["awakening", "reckoning", "calling", "self-review"],
      reversedMeanings: ["self-criticism", "avoidance", "doubt", "unfinished lesson"]
    ),
    TarotCard(
      id: "the_world",
      name: "The World",
      arcana: "Major Arcana",
      uprightMeanings: ["completion", "integration", "fulfillment", "arrival"],
      reversedMeanings: ["loose ends", "delayed closure", "unfinished business", "almost there"]
    ),
  ]
}
