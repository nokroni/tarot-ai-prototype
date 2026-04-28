const { normalizeLanguageCode } = require("../services/language");

function buildConditionalGuidance({ questionFocus, questionScale, answerGuidance }, language) {
  const isEnglish = normalizeLanguageCode(language) === "en";
  const rules = [];

  if (questionFocus) {
    if (questionFocus.kind === "third_party_action") {
      rules.push(isEnglish
        ? "Read the other person's feelings, willingness, likelihood of action, and silence first; give the user a boundary or next step only after that."
        : "先读对方的感受、意愿、行动概率和推进方式；解释完之后再给用户边界或下一步。");
    } else if (questionFocus.kind === "philosophical_symbolic") {
      rules.push(isEnglish
        ? "Answer the philosophical question itself: use the cards as concepts, paradoxes, or symbols, and do not pull the answer back into the user's personal life."
        : "回答哲学问题本身：把牌当作概念、悖论或象征即可，不必转回用户个人生活。");
    } else if (questionFocus.kind === "imaginal_scene") {
      rules.push(isEnglish
        ? "Write the imagined scene directly: cards may become rivers, woods, doors, weather, objects, or figures; do not turn the scene into ordinary-life advice."
        : "直接写想象场景：牌可以变成河流、树林、门、天气、物件或出现者，不必改写成现实生活建议。");
    }
  }

  if (questionScale && questionScale.kind === "light_everyday_choice") {
    rules.push(isEnglish
      ? "Keep the answer light, short, and concrete; for food or drink choices, name the item, taste, regret, price, or immediate need without turning it into deep trauma."
      : "答案要轻、短、具体；食物饮料类选择直接说物品名、口味、后悔感、价格或当下需要，不要写成深层创伤。");
  }

  if (answerGuidance) {
    if (answerGuidance.shouldGivePreferredDirection) {
      rules.push(isEnglish
        ? "summary and overallMessage must give the leaning first, then the risk."
        : "summary 和 overallMessage 必须先给倾向，再说风险。");
    } else {
      rules.push(isEnglish
        ? "summary should give a main line, state, or reminder only; do not turn an open-ended reading into a forced yes/no answer."
        : "summary 只给主线、状态或提醒；不要把开放式问题改写成是/否答案。");
    }

    if (answerGuidance.protectedDomain) {
      rules.push(isEnglish
        ? "Only offer reflective support and safety boundaries; do not give professional instructions for medical, legal, financial, or emergency matters."
        : "仅做反思性支持和安全边界，不要给医疗、法律、财务或紧急事务的专业指令。");
    }
  }

  return rules.join(" ");
}

module.exports = {
  buildConditionalGuidance
};
