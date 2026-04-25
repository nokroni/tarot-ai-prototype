import Foundation
import TarotCore

@main
struct TarotPrototypeCLI {
  static func main() async {
    let environment = ProcessInfo.processInfo.environment
    let question = environment["TAROT_QUESTION"] ?? "What do I need to understand today?"
    let spread = Spread(rawValue: environment["TAROT_SPREAD"] ?? "") ?? .threeCard
    let apiKey = environment["OPENAI_API_KEY"] ?? ""
    let model = environment["OPENAI_MODEL"] ?? "gpt-5.4-mini"

    do {
      let drawnCards = try ReadingEngine.drawCards(spread: spread)
      let reading = TarotReading(question: question, spread: spread, drawnCards: drawnCards)

      print("Question: \(question)")
      print("Spread: \(spread.title)")
      print("")
      print("Drawn cards:")

      for drawn in drawnCards {
        print("- \(drawn.position): \(drawn.card.name) (\(drawn.orientation.rawValue))")
        print("  Keywords: \(drawn.meaningKeywords.joined(separator: ", "))")
      }

      guard !apiKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        print("")
        print("OPENAI_API_KEY is not set, so the CLI stopped after the local draw.")
        print("Prompt that would be sent:")
        print("")
        print(PromptBuilder.prompt(for: reading))
        return
      }

      print("")
      print("Interpreting with \(model)...")
      let client = OpenAIClient(apiKey: apiKey, model: model)
      let interpretation = try await client.interpret(reading: reading)
      print("")
      print(interpretation)
    } catch {
      let message = "Error: \(error.localizedDescription)\n"
      FileHandle.standardError.write(Data(message.utf8))
      Foundation.exit(1)
    }
  }
}
