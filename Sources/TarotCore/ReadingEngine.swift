import Foundation

public enum ReadingEngineError: Error, LocalizedError, Equatable {
  case deckTooSmall(required: Int, available: Int)

  public var errorDescription: String? {
    switch self {
    case .deckTooSmall(let required, let available):
      "The deck has \(available) cards, but this spread needs \(required)."
    }
  }
}

public enum ReadingEngine {
  public static func drawCards(spread: Spread, deck: [TarotCard] = TarotDeck.cards) throws
    -> [DrawnCard]
  {
    var generator = SystemRandomNumberGenerator()
    return try drawCards(spread: spread, deck: deck, using: &generator)
  }

  public static func drawCards<Generator: RandomNumberGenerator>(
    spread: Spread,
    deck: [TarotCard] = TarotDeck.cards,
    using generator: inout Generator
  ) throws -> [DrawnCard] {
    let positions = spread.positions

    guard deck.count >= positions.count else {
      throw ReadingEngineError.deckTooSmall(required: positions.count, available: deck.count)
    }

    let shuffledDeck = deck.shuffled(using: &generator)

    return zip(positions, shuffledDeck.prefix(positions.count)).map { position, card in
      DrawnCard(
        card: card,
        position: position,
        orientation: Bool.random(using: &generator) ? .upright : .reversed
      )
    }
  }
}
