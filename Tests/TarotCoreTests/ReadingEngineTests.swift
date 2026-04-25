import XCTest

@testable import TarotCore

final class ReadingEngineTests: XCTestCase {
  func testOneCardSpreadDrawsExactlyOneLocalCard() throws {
    var generator = SeededGenerator(seed: 1)

    let drawnCards = try ReadingEngine.drawCards(
      spread: .oneCard,
      deck: TarotDeck.cards,
      using: &generator
    )

    XCTAssertEqual(drawnCards.count, 1)
    XCTAssertEqual(drawnCards[0].position, "Guidance")
    XCTAssertTrue(Orientation.allCases.contains(drawnCards[0].orientation))
  }

  func testThreeCardSpreadDrawsUniqueCardsForKnownPositions() throws {
    var generator = SeededGenerator(seed: 42)

    let drawnCards = try ReadingEngine.drawCards(
      spread: .threeCard,
      deck: TarotDeck.cards,
      using: &generator
    )

    XCTAssertEqual(drawnCards.map(\.position), ["Situation", "Challenge", "Advice"])
    XCTAssertEqual(Set(drawnCards.map { $0.card.id }).count, 3)
  }

  func testPromptIncludesOnlyDrawnCardsAndLocalMeanings() throws {
    let card = TarotDeck.cards[0]
    let drawnCard = DrawnCard(card: card, position: "Guidance", orientation: .reversed)
    let reading = TarotReading(
      question: "What should I notice?",
      spread: .oneCard,
      drawnCards: [drawnCard]
    )

    let prompt = PromptBuilder.prompt(for: reading)

    XCTAssertTrue(prompt.contains("What should I notice?"))
    XCTAssertTrue(prompt.contains("Card: The Fool"))
    XCTAssertTrue(prompt.contains("Orientation: reversed"))
    XCTAssertTrue(prompt.contains("Keywords: recklessness, hesitation, naivety, poor planning"))
    XCTAssertTrue(prompt.contains("Interpret only these cards. Do not invent extra cards."))
  }

  func testDeckTooSmallThrowsBeforeDrawing() {
    var generator = SeededGenerator(seed: 12)

    XCTAssertThrowsError(
      try ReadingEngine.drawCards(
        spread: .threeCard, deck: Array(TarotDeck.cards.prefix(2)), using: &generator)
    ) { error in
      XCTAssertEqual(error as? ReadingEngineError, .deckTooSmall(required: 3, available: 2))
    }
  }
}

private struct SeededGenerator: RandomNumberGenerator {
  private var state: UInt64

  init(seed: UInt64) {
    state = seed
  }

  mutating func next() -> UInt64 {
    state = state &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
    return state
  }
}
