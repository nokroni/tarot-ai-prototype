const { normalizeLanguageCode } = require("../services/language");

function createSpreadGuidance(question, spread, decisionOptions, questionFocus, questionScale, answerGuidance, language) {
  const languageCode = normalizeLanguageCode(language);

  if (languageCode === "en") {
    return createEnglishSpreadGuidance(question, spread, decisionOptions, questionFocus, questionScale, answerGuidance);
  }

  const safeQuestion = String(question || "").trim() || "没有提供具体问题。";
  const spreadId = spread && spread.id;
  const positions = spread && Array.isArray(spread.positions) ? spread.positions : [];
  const planA = decisionOptions && decisionOptions.planA ? decisionOptions.planA : "未填写方案 A";
  const planB = decisionOptions && decisionOptions.planB ? decisionOptions.planB : "未填写方案 B";
  const focus = questionFocus;
  const scale = questionScale;
  const cardCount = positions.length || 0;
  const isLightEveryday = scale && scale.kind === "light_everyday_choice";
  const answer = answerGuidance;
  const isPhilosophical = focus && focus.kind === "philosophical_symbolic";
  const isImaginalScene = focus && focus.kind === "imaginal_scene";
  const baseGuidance = {
    questionFocus: `所有解释都要回到用户的问题：“${safeQuestion}”。${focus ? focus.instruction : ""}`,
    questionScale: scale ? scale.instruction : "",
    answerFirstRule: "先回答问题本身，再给解释；除非用户问的是自己，否则不要把主体改写成用户的内心感受。哲学问题回答哲学命题，想象场景回答场景里出现什么。",
    proportionalityRule: "解读深度必须和问题重量相称。低风险日常小选择要轻、短、具体，不要写成深层创伤、命运危机或漫长心理诊断；关系、职业、长期困扰才需要更深的情绪层。",
    lengthRule: isLightEveryday
      ? "本题是低风险日常小选择，必须短答：summary 最多 2 句；每张 cards[].interpretation 最多 2 句；overallMessage 最多 2 句；practicalReflection 只写 1 句。不要把每张牌都展开成完整长段。"
      : "按问题复杂度控制篇幅；不要为了显得完整而重复说明。",
    cardCountRule: `本次牌阵实际牌数是 ${cardCount}。必须按 drawnCards.length 描述牌数；drawnCards.length === 1 时只能说“这张牌/单牌”，不要说“三张牌”“这几张牌”或“这些牌”。不要写“三张牌只有一张”这类矛盾句。`,
    clarityRule: "清楚比短更重要。不要为了显得精准或有风格，把话压缩成看不懂的短句；必要时用稍长的完整句把“谁、什么感受、会怎样、该怎么做”说清楚。情绪与选择要写成普通人能立刻懂的现实影响，例如“这样会让你只剩分析，反而更难感觉自己真正想要什么”。",
    keywordRule: "牌面关键词是后台读法，不是必须原样展示的词条。每张 cards[].interpretation 要吸收所有与问题相关的关键词含义，但要用自然中文合并和转述；不要机械引用原始关键词，也不要写“某关键词表示某事”。",
    cardRule: "不要写泛泛牌义。每张牌都要同时连接牌位、正逆位、相关含义组合和用户问题；保留牌义解释，但要像读牌人自然说话：可以写“恶魔正位对这个问题的影响是……，因为这张牌带有……的含义”“星币二逆位此时出现，像是在提醒……”“在此刻抽中高塔，象征这段关系可能会迎来突然的变故”。不要写成百科段落。",
    visibleStyleRule: "内部分析词只用于思考，不要暴露成面向用户的固定骨架。每段都要像自然对话，不能每张牌都按同一个标签模板输出。",
    readerNameRule: "面向用户的正文不得用读牌人名字自称或第三人称引用读牌人。不要使用“读牌人名字 + 判断/觉得/会说”这类署名句。直接写“我会更偏向……”“我会把这张牌读成……”。",
    summaryRule: "summary 先给结论或主线，不要只写抽象氛围。只有 answerGuidance.shouldGivePreferredDirection 为 true 时才给偏是、偏否或二选一选择；开放式问题写状态、主线或提醒；哲学/想象问题可以直接给命题或画面。",
    practicalRule: isImaginalScene
      ? "practicalReflection 写成一句收束画面的提醒或可带走的象征，不必给现实行动。"
      : isPhilosophical
        ? "practicalReflection 写成一句可反复咀嚼的哲学回声或提问，不必给现实行动。"
        : "practicalReflection 必须给一个小而可验证、可撤回的行动。语气像熟人提醒，不要像官方建议。"
  };

  if (spreadId === "rahdueWheel") {
    const sections = spread && Array.isArray(spread.sections) ? spread.sections : [];

    return {
      kind: "rahdue_wheel_full_deck",
      title: "拉杜之轮",
      positions,
      sections,
      ...baseGuidance,
      experimentalNotice: "这是高度实验且不稳定的数字化改编，不是 Connolly 体系的权威复刻；它用于象征性探索前世洞见与内在智慧，不要写成确定预言、前世事实或专业建议。",
      template: "Rahdue 专用阅读模板：主线 summary、分区 sections[]、完整牌位 cards[]、整体 overallMessage；不要给用户显示为“行动提醒”的建议段。",
      answerShape: "采用 Layered Summary：summary 先给完整牌组的主线；sections[] 写分区层级总结；cards[] 保持 78 张完整顺序，但每张只给一条极短提示。",
      practicalRule: "Rahdue 阅读页不会显示“行动提醒”。practicalReflection 只为 schema 兼容保留，写成一句安静的收束观察，不要写行动建议。",
      cardRoles: sections.map((section) => `${section.title}：把第 ${section.start}-${section.end} 张合并成一层主题，挑少量关键牌即可，不要逐张长篇展开。`)
    };
  }

  if (spreadId === "oneCard") {
    const singleAnswerShape = answer && answer.kind === "single_yes_no"
      ? "用一张牌直接回答此刻最重要的方向。只能把整体称为“这张牌”或“单牌”，不要写“三张牌”。这是是/否式问题，先说倾向，再解释这张牌的多个相关关键词如何共同落到问题上。如果牌面信号不是强烈的是或否，必须说明把它强行当成确定答案的风险。"
      : isImaginalScene
        ? "用一张牌直接展开用户提出的想象场景。只能把整体称为“这张牌”或“单牌”，不要写“三张牌”。先回答会看见、出现或遇见什么，再说明这张牌如何把关键词变成画面。不要写成“偏是/偏否/我会选”，也不要把画面强行改成现实生活建议。"
        : isPhilosophical
          ? "用一张牌直接回答用户提出的哲学命题。只能把整体称为“这张牌”或“单牌”，不要写“三张牌”。先给一个命题、悖论或象征性答案，再解释这张牌的多个相关关键词如何支持它。不要写成“偏是/偏否/我会选”，也不要把哲学问题强行改成个人生活建议。"
          : "用一张牌直接回答用户问的主题。只能把整体称为“这张牌”或“单牌”，不要写“三张牌”。这是开放式单牌问题，先说核心提醒或当前主线，不要写成“偏是/偏否/我会选”。再解释这张牌的多个相关关键词如何共同落到问题上。";
    const singleCardRole = answer && answer.kind === "single_yes_no"
      ? "指引：抓住这张牌与问题最相关的含义组合，把它读成具体方向，而不是完整牌义百科；如果答案只能给“偏是/偏否/暂缓”，要点明贸然当成确定同意或确定否定的代价。"
      : isImaginalScene
        ? "指引：抓住这张牌与问题最相关的含义组合，把它读成一个可感的画面、出现者或场景转折；不要把想象场景强行改成自我分析。"
        : isPhilosophical
          ? "指引：抓住这张牌与问题最相关的含义组合，把它读成一个哲学命题、寓言答案或存在悖论；不要把哲学问题强行改成个人近况分析。"
          : "指引：抓住这张牌与问题最相关的含义组合，把它读成具体状态、提醒或下一步，而不是完整牌义百科；不要把开放式问题强行改成是/否判断。";

    return {
      kind: "single_focus",
      title: "单张牌",
      positions,
      ...baseGuidance,
      answerShape: singleAnswerShape,
      cardRoles: [singleCardRole]
    };
  }

  if (spreadId === "threeCard") {
    return {
      kind: "situation_challenge_advice",
      title: "三张牌",
      positions,
      ...baseGuidance,
      answerShape: "把三张牌读成一条清楚路径：现状是什么，挑战卡在哪里，建议如何落地。整体讯息要整合三张牌，不要逐张复述后停住。",
      cardRoles: [
        "现状：说明用户现在站在哪里，吸收最贴近当下状态的关键词含义。",
        "挑战：指出阻力、误判或被回避的成本，转述最能解释卡点的关键词含义。",
        "建议：给出下一步行动方向，把最能支持行动的关键词含义自然写进去。"
      ]
    };
  }

  if (spreadId === "timeFlow") {
    return {
      kind: "past_present_future",
      title: "时间流",
      positions,
      ...baseGuidance,
      answerShape: "把时间流读成因果与趋势：过去留下什么模式，现在的转折点是什么，未来更像哪种走向。未来不是预言，要写成可被行动影响的趋势。",
      cardRoles: [
        "过去：说明已经形成的背景、余波或旧模式，转述能解释来源的关键词含义。",
        "现在：说明当前最关键的选择点或情绪事实，转述能解释当下压力的关键词含义。",
        "未来：说明按当前模式延伸的可能趋势，并给出可改变趋势的小动作。"
      ]
    };
  }

  if (spreadId === "decisionPair") {
    return {
      kind: "two_option_choice",
      title: "决策双牌",
      positions,
      ...baseGuidance,
      optionMapping: `方案 A 的用户输入是：“${planA}”。方案 B 的用户输入是：“${planB}”。drawnCards 中 position 为“方案 A”的牌只能解释方案 A，position 为“方案 B”的牌只能解释方案 B，输出按 drawnCards 顺序对应即可，不要交换或混用。`,
      answerShape: isLightEveryday
        ? "直接比较方案 A 与方案 B，并保持短答。分别用不超过两句说明各自好处和风险，然后给出更偏向的选项。若选项是具体食物或饮料，直接使用物品名和普通理由，不要展开成心理长文。"
        : "直接比较方案 A 与方案 B。分别转述两张牌最相关的关键词含义，说明各自好处、成本和风险；若不属于医疗、法律、财务或紧急问题，可以给出更偏向的选项，但不能只夸被选择的一边。如果两张牌都偏弱，要说“两个都不理想但哪边损失较小”；如果两张牌都偏强，要说“两边都可行但哪边更贴合问题”。",
      cardRoles: [
        `方案 A：只对应用户输入“${planA}”。同时说明它的优势与风险，必须自然转述 A 牌的多个相关含义。`,
        `方案 B：只对应用户输入“${planB}”。同时说明它的优势与风险，必须自然转述 B 牌的多个相关含义。`
      ]
    };
  }

  return {
    kind: "custom_spread",
    title: spread && spread.title ? spread.title : "牌阵",
    positions,
    ...baseGuidance,
    answerShape: "按牌位顺序解释每张牌，再整合成一个清楚主线。",
    cardRoles: positions.map((position) => `${position}：解释这个牌位如何改变牌义。`)
  };
}

function createEnglishSpreadGuidance(question, spread, decisionOptions, questionFocus, questionScale, answerGuidance) {
  const safeQuestion = String(question || "").trim() || "No specific question was provided.";
  const spreadId = spread && spread.id;
  const positions = spread && Array.isArray(spread.positions) ? spread.positions : [];
  const planA = decisionOptions && decisionOptions.planA ? decisionOptions.planA : "Plan A not filled in";
  const planB = decisionOptions && decisionOptions.planB ? decisionOptions.planB : "Plan B not filled in";
  const focus = questionFocus;
  const scale = questionScale;
  const cardCount = positions.length || 0;
  const isLightEveryday = scale && scale.kind === "light_everyday_choice";
  const answer = answerGuidance;
  const isPhilosophical = focus && focus.kind === "philosophical_symbolic";
  const isImaginalScene = focus && focus.kind === "imaginal_scene";
  const baseGuidance = {
    questionFocus: `Every explanation must return to the user's question: "${safeQuestion}". ${focus ? focus.instruction : ""}`,
    questionScale: scale ? scale.instruction : "",
    answerFirstRule: "Answer the question itself first, then explain. Unless the user asks about themselves, do not rewrite the subject as the user's inner feelings. Philosophical questions answer the proposition; imaginative questions answer what appears in the scene.",
    proportionalityRule: "Depth must match the weight of the question. Low-risk daily choices should be light, short, and concrete; relationships, work, and long-term difficulties may go deeper.",
    lengthRule: isLightEveryday
      ? "This is a low-risk everyday choice. Keep it short: summary max 2 sentences, each cards[].interpretation max 2 sentences, overallMessage max 2 sentences, practicalReflection exactly 1 sentence."
      : "Control length by question complexity. Do not repeat points just to sound complete.",
    cardCountRule: `The actual spread has ${cardCount} card(s). Describe the number according to drawnCards.length. If drawnCards.length === 1, say "this card" or "the single card"; do not call it a three-card reading.`,
    clarityRule: "Clarity matters more than brevity. Do not make the prose strange to sound precise or stylish. Use complete, natural sentences that explain who is involved, what is felt, what may happen, and what can be done.",
    keywordRule: "Card keywords are internal material, not a glossary. Each cards[].interpretation must absorb all relevant keyword meanings and translate them into natural English. Do not write as a keyword list.",
    cardRule: "Do not write generic card encyclopedia text. Connect each card to position, orientation, relevant meanings, and the user's question. It is fine to write naturally: “The Devil upright affects this question by... because this card carries...”, “Two of Pentacles reversed suggests...”, or “Drawing The Tower here symbolizes a sudden change in this relationship.”",
    visibleStyleRule: "Internal analysis labels are for thinking only. Do not expose them as repeated headings. Each paragraph should sound like a natural reading, not the same template filled in again.",
    readerNameRule: "User-facing prose must not refer to the reader by name in third person. Do not write “Johnny's judgment is” or “Misty says.” Write directly: “I would lean...” or “This card suggests...”.",
    summaryRule: "summary gives the conclusion or main line first. Only when answerGuidance.shouldGivePreferredDirection is true should it give a yes/no leaning or choose between options. Open-ended questions get a state, theme, or reminder; philosophical and imaginative questions may give a proposition or image.",
    practicalRule: isImaginalScene
      ? "practicalReflection should be one closing symbolic takeaway from the scene. It does not need to be a real-life action."
      : isPhilosophical
        ? "practicalReflection should be one philosophical echo or question worth carrying. It does not need to be practical advice."
        : "practicalReflection must give one small, testable, reversible action in a close-friend tone rather than official advice."
  };

  if (spreadId === "rahdueWheel") {
    const sections = spread && Array.isArray(spread.sections) ? spread.sections : [];

    return {
      kind: "rahdue_wheel_full_deck",
      title: "Rahdue’s Wheel",
      positions,
      sections,
      ...baseGuidance,
      experimentalNotice: "This is a highly experimental and unstable digital adaptation, not an authoritative reproduction of Connolly's system; use it for symbolic past-life insight and inner wisdom, not certain prediction, past-life fact, or professional advice.",
      template: "Dedicated Rahdue reading template: main-line summary, section-level sections[], full-position cards[], and overallMessage; do not provide a user-facing Action reminder.",
      answerShape: "Use Layered Summary: summary gives the full-deck main line; sections[] gives section-level interpretation; cards[] keeps all 78 cards in order, but each card gets only one very short line.",
      practicalRule: "The Rahdue reading page does not display an Action reminder. Keep practicalReflection only for schema compatibility as one quiet closing observation, not an action step.",
      cardRoles: sections.map((section) => `${section.title}: combine cards ${section.start}-${section.end} into one layer and name only a few key cards rather than expanding every card at length.`)
    };
  }

  if (spreadId === "oneCard") {
    const singleAnswerShape = answer && answer.kind === "single_yes_no"
      ? "Use one card to answer the most important direction right now. Refer to the reading as “this card” or “the single card,” never as a three-card reading. This is a yes/no-style question: give a leaning first, then explain how several relevant meanings of the card point that way. If the signal is not a strong yes or no, name the risk of treating it as certainty."
      : isImaginalScene
        ? "Use one card to open the imagined scene. Refer to the reading as “this card” or “the single card.” First answer what appears, is seen, or is met; then explain how the card turns its keywords into an image. Do not turn the scene into ordinary life advice."
        : isPhilosophical
          ? "Use one card to answer the philosophical proposition. Refer to the reading as “this card” or “the single card.” First give a proposition, paradox, or symbolic answer; then explain how several relevant card meanings support it. Do not turn the philosophical question into personal-life advice."
          : "Use one card to answer the user's theme. Refer to the reading as “this card” or “the single card.” This is an open-ended single-card question: give the core message or current main line first, not a forced yes/no answer. Then explain how the card's relevant meanings meet the question.";
    const singleCardRole = answer && answer.kind === "single_yes_no"
      ? "Guide: read the card's most relevant meaning cluster as a concrete direction, not a full encyclopedia entry; if the answer is only lean yes, lean no, or pause, explain the cost of treating it as certain."
      : isImaginalScene
        ? "Guide: turn the card's most relevant meaning cluster into a tangible image, figure, or scene turn; do not force the imagined scene into self-analysis."
        : isPhilosophical
          ? "Guide: turn the card's relevant meaning cluster into a philosophical proposition, fable answer, or existential paradox; do not force the question into personal status analysis."
          : "Guide: read the card's relevant meaning cluster as a concrete state, reminder, or next step; do not force an open-ended question into yes/no.";

    return {
      kind: "single_focus",
      title: "Single Card",
      positions,
      ...baseGuidance,
      answerShape: singleAnswerShape,
      cardRoles: [singleCardRole]
    };
  }

  if (spreadId === "threeCard") {
    return {
      kind: "situation_challenge_advice",
      title: "Three Cards",
      positions,
      ...baseGuidance,
      answerShape: "Read the three cards as one clear path: what the situation is, where the challenge catches, and how the advice can land. The overall message must integrate the cards instead of stopping after three separate summaries.",
      cardRoles: [
        "Situation: show where the user stands now and absorb the meanings closest to the current state.",
        "Challenge: name the resistance, misread, or avoided cost using the meanings that best explain the block.",
        "Advice: give the next direction and naturally include the meanings that support action."
      ]
    };
  }

  if (spreadId === "timeFlow") {
    return {
      kind: "past_present_future",
      title: "Time Flow",
      positions,
      ...baseGuidance,
      answerShape: "Read the time flow as cause and trend: what pattern the past left, what the present turning point is, and what direction the future may take. The future is not a prophecy; write it as a trend that can be affected by action.",
      cardRoles: [
        "Past: explain the background, echo, or old pattern and translate the meanings that explain its source.",
        "Now: explain the most important current choice point or emotional fact and translate the meanings that explain present pressure.",
        "Future: describe the likely trend if the current pattern continues, plus a small way to affect it."
      ]
    };
  }

  if (spreadId === "decisionPair") {
    return {
      kind: "two_option_choice",
      title: "Two-Card Choice",
      positions,
      ...baseGuidance,
      optionMapping: `The user's Plan A input is: "${planA}". The user's Plan B input is: "${planB}". In drawnCards, the entry whose position is "Plan A" must be interpreted only as Plan A, and the entry whose position is "Plan B" must be interpreted only as Plan B; keep cards[] in the same order as drawnCards and do not swap or merge them.`,
      answerShape: isLightEveryday
        ? "Compare Plan A and Plan B directly and keep it short. Give each option's upside and risk in no more than two sentences, then name the option you lean toward. If the options are concrete food or drinks, use the item names and ordinary reasons instead of a long psychological reading."
        : "Compare Plan A and Plan B directly. Explain each option's upside, cost, and risk by translating the most relevant card meanings. If it is not medical, legal, financial, or urgent, give a preferred option, but do not only praise the chosen side. If both cards are weak, say which loss is smaller; if both are strong, say which one fits the question better.",
      cardRoles: [
        `Plan A: only answer the user's Plan A input, "${planA}". Show both its advantage and risk, using several relevant meanings from the A card.`,
        `Plan B: only answer the user's Plan B input, "${planB}". Show both its advantage and risk, using several relevant meanings from the B card.`
      ]
    };
  }

  return {
    kind: "custom_spread",
    title: spread && spread.title ? spread.title : "Spread",
    positions,
    ...baseGuidance,
    answerShape: "Explain each card in position order, then integrate them into one clear main line.",
    cardRoles: positions.map((position) => `${position}: explain how this position changes the card meaning.`)
  };
}

module.exports = {
  createSpreadGuidance
};
