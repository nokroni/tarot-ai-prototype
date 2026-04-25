import Foundation

public enum PromptBuilder {
  public static let instructions = """
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

  public static func prompt(for reading: TarotReading) -> String {
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
