import SwiftUI
import TarotCore

struct ContentView: View {
  @StateObject private var viewModel: ReadingViewModel

  init(viewModel: ReadingViewModel) {
    _viewModel = StateObject(wrappedValue: viewModel)
  }

  var body: some View {
    NavigationStack {
      Form {
        Section("Your question") {
          TextField(
            "What do I need to understand today?",
            text: $viewModel.question,
            axis: .vertical
          )
          .lineLimit(2...4)
        }

        Section("Spread") {
          Picker("Spread", selection: $viewModel.selectedSpread) {
            ForEach(Spread.allCases) { spread in
              Text(spread.title).tag(spread)
            }
          }
          .pickerStyle(.segmented)
          .onChange(of: viewModel.selectedSpread) {
            viewModel.drawnCards = []
            viewModel.interpretation = ""
            viewModel.errorMessage = nil
          }
        }

        Section {
          Button {
            viewModel.drawCards()
          } label: {
            Label("Draw Cards", systemImage: "sparkles")
          }

          Button {
            Task {
              await viewModel.interpretReading()
            }
          } label: {
            if viewModel.isLoading {
              ProgressView()
            } else {
              Label("Interpret with AI", systemImage: "wand.and.stars")
            }
          }
          .disabled(viewModel.drawnCards.isEmpty || viewModel.isLoading)
        }

        if !viewModel.drawnCards.isEmpty {
          Section("Drawn Cards") {
            ForEach(viewModel.drawnCards) { drawn in
              VStack(alignment: .leading, spacing: 6) {
                Text(drawn.position)
                  .font(.caption)
                  .foregroundStyle(.secondary)

                Text(drawn.card.name)
                  .font(.headline)

                Text(drawn.orientation.rawValue.capitalized)
                  .font(.subheadline)

                Text(drawn.meaningKeywords.joined(separator: ", "))
                  .font(.caption)
                  .foregroundStyle(.secondary)
              }
              .padding(.vertical, 4)
            }
          }
        }

        if let error = viewModel.errorMessage {
          Section("Error") {
            Text(error)
              .foregroundStyle(.red)
          }
        }

        if !viewModel.interpretation.isEmpty {
          Section("Reading") {
            Text(viewModel.interpretation)
              .textSelection(.enabled)
          }
        }

        Section("Note") {
          Text(
            "Tarot readings are for reflection and entertainment, not professional advice or certain predictions."
          )
          .font(.caption)
          .foregroundStyle(.secondary)
        }
      }
      .navigationTitle("AI Tarot")
    }
  }
}

#Preview {
  ContentView(
    viewModel: ReadingViewModel(
      openAIClient: OpenAIClient(apiKey: "")
    )
  )
}
