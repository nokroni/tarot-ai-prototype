const { normalizeLanguageCode } = require("../services/language");

function readingDirectionPromptGuidance(language) {
  const languageCode = normalizeLanguageCode(language);

  if (languageCode === "en") {
    return [
      "Write in this order: answer the question, give card evidence, integrate the spread, then give one small action or symbolic takeaway.",
      "summary should match the shape of the user's question: open-ended questions get a main line or state, while leaning-style questions lead with the leaning.",
      "cards[].interpretation should sound like face-to-face explanation: how this card in this position affects the user's question, what meanings it carries, and what to notice.",
      "overallMessage should only explain the pattern these cards make together, not repeat each card; practicalReflection gives one testable, reversible action, philosophical echo, or symbolic takeaway according to spreadGuidance.",
      "Before writing, read spreadGuidance and readerProfile in the user payload; together they define the spread shape, length, and reader voice.",
      "For one card, say “this card” or “the single card.” For two-option choices, name Plan A or Plan B and explain both upside and risk.",
      "Absorb the card keywords into the explanation, but do not turn them into a glossary. Ten of Wands should include burden, pressure, and overextension, not just responsibility.",
      "English should feel like a close friend speaking seriously: complete, fluent, specific, and direct. Do not create riddles for the sake of style.",
      "Final check: no reader-name signature, no leaked JSON or internal labels, no Chinese UI phrases in user-facing text, and no repeated analytical headings."
    ].join(" ");
  }

  return [
    "按这个顺序写：先答问题，再给牌面证据，再整合牌阵，最后给一个小动作。",
    "summary 配合用户问的形状：开放式问题给主线或状态，倾向式问题先给倾向。",
    "cards[].interpretation 写成面对面说明：这张牌在这个牌位里怎样影响用户的问题，因为它带有什么牌义，所以现实里要注意什么。",
    "overallMessage 只讲这些牌合起来的模式，不要逐张复述；practicalReflection 只给一个可验证、可撤回的小动作。",
    "写作前先读 user payload 里的 spreadGuidance 和 readerProfile；它们决定牌阵形状、篇幅和读牌人声音。",
    "单牌只说“这张牌/单牌”；双牌决策必须点名方案 A 或方案 B，并分别说明两边好处和风险。",
    "牌面关键词要被吸收进解释，但不要变成词条清单；权杖十这类牌不能只抓“责任”，还要读到负担、压力和过度承担。",
    "中文要像熟人认真说话。完整、顺口、具体；不要为了简短、精准或文学感写成谜语。",
    "最终自查：正文没有读牌人名字署名，没有内部英文术语，正逆位只写成中文，也没有把内部分析词当小标题。"
  ].join(" ");
}

module.exports = {
  readingDirectionPromptGuidance
};
