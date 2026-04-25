import Foundation

#if canImport(FoundationNetworking)
  import FoundationNetworking
#endif

public enum OpenAIClientError: Error, LocalizedError, Equatable {
  case missingAPIKey
  case invalidResponse
  case apiError(statusCode: Int, body: String)
  case noTextOutput

  public var errorDescription: String? {
    switch self {
    case .missingAPIKey:
      "Missing OpenAI API key."
    case .invalidResponse:
      "Invalid response from API."
    case .apiError(let statusCode, let body):
      "OpenAI API error \(statusCode): \(body)"
    case .noTextOutput:
      "The model returned no text output."
    }
  }
}

public final class OpenAIClient {
  private let apiKey: String
  private let model: String
  private let session: URLSession

  public init(
    apiKey: String,
    model: String = "gpt-5.4-mini",
    session: URLSession = .shared
  ) {
    self.apiKey = apiKey
    self.model = model
    self.session = session
  }

  public func interpret(reading: TarotReading) async throws -> String {
    guard !apiKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw OpenAIClientError.missingAPIKey
    }

    let url = URL(string: "https://api.openai.com/v1/responses")!
    let body = ResponsesRequest(
      model: model,
      instructions: PromptBuilder.instructions,
      input: PromptBuilder.prompt(for: reading),
      maxOutputTokens: 900,
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
      throw OpenAIClientError.apiError(statusCode: httpResponse.statusCode, body: bodyText)
    }

    let decoded = try JSONDecoder().decode(ResponsesAPIResponse.self, from: data)
    let text = decoded.textOutput.trimmingCharacters(in: .whitespacesAndNewlines)

    guard !text.isEmpty else {
      throw OpenAIClientError.noTextOutput
    }

    return text
  }
}

private struct ResponsesRequest: Encodable {
  let model: String
  let instructions: String
  let input: String
  let maxOutputTokens: Int
  let store: Bool

  enum CodingKeys: String, CodingKey {
    case model
    case instructions
    case input
    case maxOutputTokens = "max_output_tokens"
    case store
  }
}

private struct ResponsesAPIResponse: Decodable {
  let outputText: String?
  let output: [OutputItem]?

  var textOutput: String {
    if let outputText, !outputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return outputText
    }

    return output?
      .flatMap { $0.content ?? [] }
      .compactMap(\.text)
      .joined(separator: "\n") ?? ""
  }

  enum CodingKeys: String, CodingKey {
    case outputText = "output_text"
    case output
  }

  struct OutputItem: Decodable {
    let type: String?
    let content: [ContentItem]?
  }

  struct ContentItem: Decodable {
    let type: String?
    let text: String?
  }
}
