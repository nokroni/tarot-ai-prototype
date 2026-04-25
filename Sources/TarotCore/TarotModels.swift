import Foundation

public enum Orientation: String, CaseIterable, Codable, Sendable {
  case upright
  case reversed
}

public struct TarotCard: Identifiable, Codable, Hashable, Sendable {
  public let id: String
  public let name: String
  public let arcana: String
  public let uprightMeanings: [String]
  public let reversedMeanings: [String]

  public init(
    id: String,
    name: String,
    arcana: String,
    uprightMeanings: [String],
    reversedMeanings: [String]
  ) {
    self.id = id
    self.name = name
    self.arcana = arcana
    self.uprightMeanings = uprightMeanings
    self.reversedMeanings = reversedMeanings
  }
}

public struct DrawnCard: Identifiable, Codable, Hashable, Sendable {
  public let id: String
  public let card: TarotCard
  public let position: String
  public let orientation: Orientation

  public init(card: TarotCard, position: String, orientation: Orientation) {
    self.id = "\(card.id)-\(position)"
    self.card = card
    self.position = position
    self.orientation = orientation
  }

  public var meaningKeywords: [String] {
    orientation == .upright ? card.uprightMeanings : card.reversedMeanings
  }
}

public enum Spread: String, CaseIterable, Identifiable, Codable, Sendable {
  case oneCard
  case threeCard

  public var id: String { rawValue }

  public var title: String {
    switch self {
    case .oneCard:
      "One Card"
    case .threeCard:
      "Three Cards"
    }
  }

  public var positions: [String] {
    switch self {
    case .oneCard:
      ["Guidance"]
    case .threeCard:
      ["Situation", "Challenge", "Advice"]
    }
  }
}

public struct TarotReading: Codable, Hashable, Sendable {
  public let question: String
  public let spread: Spread
  public let drawnCards: [DrawnCard]

  public init(question: String, spread: Spread, drawnCards: [DrawnCard]) {
    self.question = question
    self.spread = spread
    self.drawnCards = drawnCards
  }
}
