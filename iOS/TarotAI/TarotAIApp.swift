import SwiftUI
import TarotCore

@main
struct TarotAIApp: App {
  var body: some Scene {
    WindowGroup {
      let apiKey = ProcessInfo.processInfo.environment["OPENAI_API_KEY"] ?? ""
      let model = ProcessInfo.processInfo.environment["OPENAI_MODEL"] ?? "gpt-5.4-mini"

      ContentView(
        viewModel: ReadingViewModel(
          openAIClient: OpenAIClient(apiKey: apiKey, model: model)
        )
      )
    }
  }
}
