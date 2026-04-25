import Foundation
import TarotCore

@MainActor
final class ReadingViewModel: ObservableObject {
  @Published var question = ""
  @Published var selectedSpread: Spread = .threeCard
  @Published var drawnCards: [DrawnCard] = []
  @Published var interpretation = ""
  @Published var isLoading = false
  @Published var errorMessage: String?

  private let openAIClient: OpenAIClient

  init(openAIClient: OpenAIClient) {
    self.openAIClient = openAIClient
  }

  func drawCards() {
    do {
      drawnCards = try ReadingEngine.drawCards(spread: selectedSpread)
      interpretation = ""
      errorMessage = nil
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  func interpretReading() async {
    guard !drawnCards.isEmpty else {
      errorMessage = "Draw cards first."
      return
    }

    isLoading = true
    errorMessage = nil

    let reading = TarotReading(
      question: question,
      spread: selectedSpread,
      drawnCards: drawnCards
    )

    do {
      interpretation = try await openAIClient.interpret(reading: reading)
    } catch {
      errorMessage = error.localizedDescription
    }

    isLoading = false
  }
}
