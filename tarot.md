Below is a practical MVP plan for an AI tarot iOS app using SwiftUI and direct OpenAI API calls from the app.

## 1. MVP scope

Build the first version around one simple flow:

**User enters a question → selects a spread → app draws cards locally → OpenAI interprets the result → app displays the reading.**

Keep the first version intentionally narrow:

| Feature        | MVP version                          |
| -------------- | ------------------------------------ |
| Tarot deck     | Local JSON/static Swift array        |
| Spreads        | 1-card and 3-card spread             |
| Card draw      | Done inside the app, not by AI       |
| Interpretation | OpenAI Responses API                 |
| Storage        | Optional local history later         |
| Server         | None for prototype                   |
| Images         | Optional; start with text-only cards |

The important product rule: **the app should draw the cards itself**, then ask AI to interpret the already-drawn cards. Do not ask the model to randomly choose cards, because that makes the reading less deterministic and harder to test.

## 2. API approach

Use OpenAI’s **Responses API** rather than the older Chat Completions style. OpenAI’s current docs position Responses as the recommended API for new model requests, with a simple shape like `model`, `instructions`, and `input`. ([OpenAI Developers][1])

For the model, start with a smaller cost/latency-optimized model such as `gpt-5.4-mini` for normal readings. Use a larger model like `gpt-5.5` only if you want premium-quality interpretations, because current OpenAI docs recommend smaller variants such as `gpt-5.4-mini` or `gpt-5.4-nano` when optimizing for latency and cost. ([OpenAI Developers][2])

One serious caveat: **direct API calls from an iOS app are not safe for production**. OpenAI explicitly warns not to deploy API keys in client-side environments such as mobile apps, because users can extract the key and make calls on your behalf. For your prototype, direct calls are acceptable only for local development, or if each tester enters their own API key. Before App Store launch, add a tiny backend/proxy. ([OpenAI Help Center][3])

## 3. Suggested project structure

Create a new **iOS App → SwiftUI** project in Xcode.

Use this file structure:

```text
TarotAI/
  TarotAIApp.swift
  Models/
    TarotModels.swift
    TarotDeck.swift
  Services/
    OpenAIClient.swift
  ViewModels/
    ReadingViewModel.swift
  Views/
    ContentView.swift
```

## 4. Core data models

Create `TarotModels.swift`:

```swift
import Foundation

enum Orientation: String, Codable {
    case upright
    case reversed
}

struct TarotCard: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    let arcana: String
    let uprightMeanings: [String]
    let reversedMeanings: [String]
}

struct DrawnCard: Identifiable, Codable {
    let id = UUID()
    let card: TarotCard
    let position: String
    let orientation: Orientation

    var meaningKeywords: [String] {
        orientation == .upright ? card.uprightMeanings : card.reversedMeanings
    }
}

enum Spread: String, CaseIterable, Identifiable, Codable {
    case oneCard
    case threeCard

    var id: String { rawValue }

    var title: String {
        switch self {
        case .oneCard:
            return "One Card"
        case .threeCard:
            return "Three Cards"
        }
    }

    var positions: [String] {
        switch self {
        case .oneCard:
            return ["Guidance"]
        case .threeCard:
            return ["Situation", "Challenge", "Advice"]
        }
    }
}

struct TarotReading {
    let question: String
    let spread: Spread
    let drawnCards: [DrawnCard]
}
```

## 5. Add a small local tarot deck

Create `TarotDeck.swift`.

Start with a small sample while building the app. Later, expand this to the full 78-card deck, preferably from a local JSON file.

```swift
import Foundation

enum TarotDeck {
    static let cards: [TarotCard] = [
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
            id: "the_lovers",
            name: "The Lovers",
            arcana: "Major Arcana",
            uprightMeanings: ["choice", "alignment", "relationship", "values"],
            reversedMeanings: ["misalignment", "difficult choice", "imbalance"]
        )
    ]
}
```

For the real app, create all 78 cards locally. Do not rely on the AI model to know your deck meanings consistently.

## 6. Build the OpenAI client

Create `OpenAIClient.swift`.

This uses `URLSession`, so you do not need an external Swift package.

```swift
import Foundation

enum OpenAIClientError: Error, LocalizedError {
    case missingAPIKey
    case invalidResponse
    case apiError(statusCode: Int, body: String)
    case noTextOutput

    var errorDescription: String? {
        switch self {
        case .missingAPIKey:
            return "Missing OpenAI API key."
        case .invalidResponse:
            return "Invalid response from API."
        case .apiError(let statusCode, let body):
            return "OpenAI API error \(statusCode): \(body)"
        case .noTextOutput:
            return "The model returned no text output."
        }
    }
}

final class OpenAIClient {
    private let apiKey: String
    private let model: String
    private let session: URLSession

    init(
        apiKey: String,
        model: String = "gpt-5.4-mini",
        session: URLSession = .shared
    ) {
        self.apiKey = apiKey
        self.model = model
        self.session = session
    }

    func interpret(reading: TarotReading) async throws -> String {
        guard !apiKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw OpenAIClientError.missingAPIKey
        }

        let url = URL(string: "https://api.openai.com/v1/responses")!

        let body = ResponsesRequest(
            model: model,
            instructions: Self.instructions,
            input: Self.prompt(for: reading),
            max_output_tokens: 900,
            store: false
        )

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw OpenAIClientError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let bodyText = String(data: data, encoding: .utf8) ?? ""
            throw OpenAIClientError.apiError(
                statusCode: httpResponse.statusCode,
                body: bodyText
            )
        }

        let decoded = try JSONDecoder().decode(ResponsesAPIResponse.self, from: data)
        let text = decoded.output
            .flatMap { $0.content ?? [] }
            .compactMap { $0.text }
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard !text.isEmpty else {
            throw OpenAIClientError.noTextOutput
        }

        return text
    }

    private static let instructions = """
    You are an AI tarot interpreter for a mobile app.

    Your style:
    - Warm, clear, reflective, and grounded.
    - Treat tarot as symbolic self-reflection, not certain prediction.
    - Do not claim supernatural certainty.
    - Do not give medical, legal, financial, or emergency advice.
    - If the user's question asks for high-stakes advice, redirect to reflective guidance and suggest consulting a qualified professional.

    Output in Markdown with these sections:
    1. Summary
    2. Card-by-card interpretation
    3. Overall message
    4. Practical reflection
    5. One question to journal about
    """

    private static func prompt(for reading: TarotReading) -> String {
        let question = reading.question.trimmingCharacters(in: .whitespacesAndNewlines)
        let safeQuestion = question.isEmpty ? "No specific question was provided." : question

        let cardLines = reading.drawnCards.map { drawn in
            """
            Position: \(drawn.position)
            Card: \(drawn.card.name)
            Orientation: \(drawn.orientation.rawValue)
            Keywords: \(drawn.meaningKeywords.joined(separator: ", "))
            """
        }.joined(separator: "\n\n")

        return """
        User question:
        \(safeQuestion)

        Spread:
        \(reading.spread.title)

        Drawn cards:
        \(cardLines)

        Interpret only these cards. Do not invent extra cards.
        """
    }
}

private struct ResponsesRequest: Encodable {
    let model: String
    let instructions: String
    let input: String
    let max_output_tokens: Int
    let store: Bool
}

private struct ResponsesAPIResponse: Decodable {
    let output: [OutputItem]

    struct OutputItem: Decodable {
        let type: String
        let content: [ContentItem]?
    }

    struct ContentItem: Decodable {
        let type: String
        let text: String?
    }
}
```

The request above uses the Responses endpoint with `instructions` and `input`, matching OpenAI’s current examples. Setting `store: false` is also supported when you do not want the response stored by default. ([OpenAI Developers][4])

## 7. Add the reading view model

Create `ReadingViewModel.swift`.

```swift
import Foundation

@MainActor
final class ReadingViewModel: ObservableObject {
    @Published var question: String = ""
    @Published var selectedSpread: Spread = .threeCard
    @Published var drawnCards: [DrawnCard] = []
    @Published var interpretation: String = ""
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?

    private let openAIClient: OpenAIClient

    init(openAIClient: OpenAIClient) {
        self.openAIClient = openAIClient
    }

    func drawCards() {
        let shuffledDeck = TarotDeck.cards.shuffled()
        let positions = selectedSpread.positions

        drawnCards = zip(positions, shuffledDeck.prefix(positions.count)).map { position, card in
            DrawnCard(
                card: card,
                position: position,
                orientation: Bool.random() ? .upright : .reversed
            )
        }

        interpretation = ""
        errorMessage = nil
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
```

## 8. Build the basic SwiftUI screen

Create or replace `ContentView.swift`.

```swift
import SwiftUI

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
                }

                Section {
                    Button("Draw Cards") {
                        viewModel.drawCards()
                    }

                    Button("Interpret with AI") {
                        Task {
                            await viewModel.interpretReading()
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

                if viewModel.isLoading {
                    Section {
                        ProgressView("Interpreting...")
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
                    Text("Tarot readings are for reflection and entertainment, not professional advice or certain predictions.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("AI Tarot")
        }
    }
}
```

## 9. Wire the app together

In `TarotAIApp.swift`:

```swift
import SwiftUI

@main
struct TarotAIApp: App {
    var body: some Scene {
        WindowGroup {
            let apiKey = ProcessInfo.processInfo.environment["OPENAI_API_KEY"] ?? ""

            ContentView(
                viewModel: ReadingViewModel(
                    openAIClient: OpenAIClient(apiKey: apiKey)
                )
            )
        }
    }
}
```

For local development, add `OPENAI_API_KEY` to your Xcode scheme environment variables. OpenAI’s quickstart recommends creating an API key and keeping it out of source code, commonly via environment variables. ([OpenAI Developers][5])

This works for simulator/local Xcode runs. It is not a production key strategy.

## 10. Development sequence

Build in this order:

1. **Create SwiftUI app shell**

   * Add `ContentView`.
   * Add question input, spread picker, and buttons.

2. **Add local tarot deck**

   * Start with a few cards.
   * Confirm drawing logic works.
   * Expand to 78 cards later.

3. **Add OpenAI API client**

   * Test with a fixed reading first.
   * Confirm response parsing.
   * Add error states for missing key, network failure, and API errors.

4. **Connect UI to API**

   * User draws cards.
   * User taps “Interpret with AI.”
   * App displays interpretation.

5. **Polish the prompt**

   * Make the output consistent.
   * Add style rules.
   * Add safety rules for high-stakes questions.

6. **Add local reading history**

   * Store question, spread, cards, interpretation, and date.
   * Use SwiftData or a simple JSON file first.

7. **Add card images**

   * Add card artwork to `Assets.xcassets`.
   * Add an `imageName` property to `TarotCard`.

8. **Prepare for real launch**

   * Replace direct OpenAI calls with a backend/proxy.
   * Add rate limiting.
   * Add authentication or anonymous device limits.
   * Add spend limits and monitoring.
   * Add a clear entertainment/reflection disclaimer.

## 11. Recommended next upgrade: structured output

For the first version, plain Markdown output is fine. Once you want more control, ask the model for structured JSON with fields like:

```json
{
  "summary": "...",
  "cards": [
    {
      "position": "...",
      "card": "...",
      "interpretation": "..."
    }
  ],
  "overallMessage": "...",
  "reflection": "...",
  "journalQuestion": "..."
}
```

OpenAI’s Structured Outputs feature is designed to make model output conform to a JSON schema, which is useful when your UI needs reliable sections instead of freeform text. ([OpenAI Developers][6])

## 12. What I would build first

For the very first working prototype, build only this:

```text
One screen:
- Question text field
- Spread selector
- Draw cards button
- Interpret button
- Result text area

Logic:
- Draw cards locally
- Send cards + question to OpenAI
- Render Markdown-style response
```

That gives you a usable MVP without backend, database, payments, authentication, or card art. Once that core loop feels good, expand the deck, improve visuals, add saved readings, then add a minimal backend before sharing the app publicly.

[1]: https://developers.openai.com/api/docs/guides/text?utm_source=chatgpt.com "Text generation | OpenAI API"
[2]: https://developers.openai.com/api/docs/models?utm_source=chatgpt.com "Models | OpenAI API"
[3]: https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety?utm_source=chatgpt.com "Best Practices for API Key Safety"
[4]: https://developers.openai.com/api/docs/guides/migrate-to-responses?utm_source=chatgpt.com "Migrate to the Responses API"
[5]: https://developers.openai.com/api/docs/quickstart?utm_source=chatgpt.com "Developer quickstart | OpenAI API"
[6]: https://developers.openai.com/api/docs/guides/structured-outputs?utm_source=chatgpt.com "Structured model outputs | OpenAI API"
