const READING_SCHEMA_VERSION = "tarot.reading.v1";
const {
  createReaderProfileRequest,
  createReaderSourceLabel,
  isDonovanReader,
  isSharpReader
} = require("./reader-profiles");
const {
  createLanguageRequest,
  formatOrientationText,
  getLanguageConfig,
  normalizeLanguageCode
} = require("./language");

function normalizeReading(rawReading, fallbackReading, language) {
  const reading = rawReading && typeof rawReading === "object" ? rawReading : {};
  const fallback = fallbackReading || {};
  const fallbackCards = Array.isArray(fallback.cards) ? fallback.cards : [];
  const sourceCards = Array.isArray(reading.cards) && reading.cards.length
    ? reading.cards
    : fallbackCards;
  const languageCode = normalizeLanguageCode(
    language ||
      reading.language ||
      fallback.language
  );
  const languageConfig = getLanguageConfig(languageCode);

  return {
    schemaVersion: reading.schemaVersion || READING_SCHEMA_VERSION,
    sourceLabel: reading.sourceLabel || fallback.sourceLabel || "原型",
    language: createLanguageRequest(languageCode),
    summary: textOr(reading.summary, fallback.summary),
    cards: sourceCards.map((card, index) =>
      mergeCardWithMetadata(card, fallbackCards, index, languageCode, languageConfig)
    ),
    overallMessage: textOr(reading.overallMessage, fallback.overallMessage),
    practicalReflection: textOr(reading.practicalReflection, fallback.practicalReflection),
    journalQuestion: textOr(reading.journalQuestion, fallback.journalQuestion),
    caveat: textOr(
      reading.caveat,
      fallback.caveat ||
        languageConfig.fullCaveat
    )
  };
}

function mergeCardWithMetadata(card, fallbackCards, index, languageCode, languageConfig) {
  const safeCard = card && typeof card === "object" ? card : {};
  const matched = safeCard.id
    ? fallbackCards.find((fallbackCard) => fallbackCard && fallbackCard.id === safeCard.id)
    : null;
  const meta = matched || fallbackCards[index] || {};
  const orientation = textOr(meta.orientation, textOr(safeCard.orientation, "upright"));
  const keywords = Array.isArray(meta.keywords) && meta.keywords.length
    ? meta.keywords
    : Array.isArray(safeCard.keywords)
      ? safeCard.keywords
      : [];

  return {
    id: textOr(safeCard.id, textOr(meta.id, `card-${index}`)),
    position: textOr(meta.position, textOr(safeCard.position, "牌位")),
    name: textOr(meta.name, textOr(safeCard.name, "未知牌")),
    orientation,
    orientationText: formatOrientation(orientation, languageCode),
    keywords,
    keywordsText: keywords.join(languageConfig.keywordJoiner),
    interpretation: textOr(safeCard.interpretation, textOr(meta.interpretation, safeCard.text || ""))
  };
}

function createFallbackReading({ question, spread, drawnCards, sourceLabel, readerProfile, language }) {
  const languageCode = normalizeLanguageCode(language);
  const languageConfig = getLanguageConfig(languageCode);
  const safeQuestion = String(question || "").trim() || (languageCode === "en" ? "what needs to be understood today" : "今天需要理解的事情");
  const primaryThemes = drawnCards.map((drawn) => drawn.keywords[0]).join(languageConfig.keywordJoiner);
  const readerProfileRequest = createReaderProfileRequest(readerProfile, languageCode);
  const questionFocus = createQuestionFocusRequest(safeQuestion, languageCode);
  const answerGuidance = createAnswerGuidance(safeQuestion, spread, languageCode);
  const directionalFallback = createDirectionalFallback({
    safeQuestion,
    spread,
    drawnCards,
    primaryThemes,
    questionFocus,
    answerGuidance,
    readerProfile: readerProfileRequest,
    language: languageCode
  });

  return {
    schemaVersion: READING_SCHEMA_VERSION,
    language: createLanguageRequest(languageCode),
    sourceLabel: createReaderSourceLabel(sourceLabel || (languageCode === "en" ? "Prototype reading" : "原型演示"), readerProfileRequest),
    summary:
      directionalFallback.summary ||
      createGeneralFallbackSummary(safeQuestion, readerProfileRequest, languageCode),
    cards: drawnCards.map((drawn) => ({
      id: drawn.id,
      position: drawn.position,
      name: drawn.card.name,
      orientation: drawn.orientation,
      keywords: drawn.keywords,
      interpretation: createFallbackCardInterpretation(drawn, readerProfileRequest, languageCode)
    })),
    overallMessage:
      directionalFallback.overallMessage ||
      createGeneralFallbackOverall(primaryThemes, readerProfileRequest, languageCode),
    practicalReflection:
      directionalFallback.practicalReflection ||
      createGeneralFallbackPractical(readerProfileRequest, languageCode),
    journalQuestion:
      directionalFallback.journalQuestion ||
      createGeneralFallbackJournal(safeQuestion, readerProfileRequest, languageCode),
    caveat: `${languageConfig.fullCaveat}${languageCode === "en" ? " " : ""}${languageConfig.professionalCaveat}`
  };
}

function createReadingRequest({ question, spread, drawnCards, readerProfile, decisionOptions, language }) {
  const languageCode = normalizeLanguageCode(language);
  const languageConfig = getLanguageConfig(languageCode);
  const safeQuestion = String(question || "").trim();
  const decisionOptionRequest = createDecisionOptionsRequest(spread, decisionOptions, languageCode);
  const questionFocus = createQuestionFocusRequest(safeQuestion, languageCode);
  const questionScale = createQuestionScaleRequest(safeQuestion, decisionOptionRequest, languageCode);
  const answerGuidance = createAnswerGuidance(safeQuestion, spread, languageCode);

  return {
    schemaVersion: READING_SCHEMA_VERSION,
    language: createLanguageRequest(languageCode),
    question: safeQuestion || (languageCode === "en" ? "No specific question was provided." : "没有提供具体问题。"),
    questionFocus,
    questionScale,
    spread: {
      id: spread.id,
      title: spread.title,
      positions: spread.positions
    },
    decisionOptions: decisionOptionRequest,
    spreadGuidance: createSpreadGuidance(
      safeQuestion,
      spread,
      decisionOptionRequest,
      questionFocus,
      questionScale,
      answerGuidance,
      languageCode
    ),
    readerProfile: createReaderProfileRequest(readerProfile, languageCode),
    answerGuidance,
    drawnCards: drawnCards.map((drawn) => ({
      id: drawn.id,
      position: drawn.position,
      name: drawn.card.name,
      arcana: drawn.card.arcana,
      orientation: drawn.orientation,
      orientationText: formatOrientation(drawn.orientation, languageCode),
      keywordsText: drawn.keywords.join(languageConfig.keywordJoiner),
      keywords: drawn.keywords
    }))
  };
}

function createQuestionFocusRequest(question, language) {
  const safeQuestion = String(question || "").trim();
  const languageCode = normalizeLanguageCode(language);

  if (isImaginalSceneQuestion(safeQuestion)) {
    return {
      kind: "imaginal_scene",
      primarySubject: languageCode === "en" ? "imagined scene" : "想象场景",
      instruction: languageCode === "en"
        ? "This is an imaginative, dreamlike, or fable-like question. Directly answer what the user may see, encounter, or find in the scene; the cards may become rivers, woods, doors, weather, objects, animals, or strangers. Do not convert the answer into the user's real-life emotions, self-improvement, or practical advice unless the question asks for that."
        : "这是想象、梦境或寓言式问题。直接回答用户进入的场景里会看见、出现或遇见什么；牌可以化成河流、树林、门、天气、物件、动物或陌生人等象征。不必把答案转成用户现实生活、情绪管理或自我改善建议。"
    };
  }

  if (isPhilosophicalQuestion(safeQuestion)) {
    return {
      kind: "philosophical_symbolic",
      primarySubject: languageCode === "en" ? "philosophical question" : "哲学问题",
      instruction: languageCode === "en"
        ? "This is a philosophical, existential, or fable-like question. Answer the question itself first, reading the cards as concepts, paradoxes, symbols, or propositions. You may discuss humanity, fate, lists, worlds, existence, choice, and accident. Do not pull the answer back to the user's recent life, personal emotion, or practical advice."
        : "这是哲学、存在或寓言式问题。先回答问题本身，把牌当作概念、悖论、象征或命题来读；可以讨论人、命运、名单、世界、存在、选择和偶然。不必把答案拉回用户近期生活、个人情绪或行动建议。"
    };
  }

  if (isThirdPartyActionQuestion(safeQuestion)) {
    return {
      kind: "third_party_action",
      primarySubject: languageCode === "en" ? "the other person" : "对方",
      instruction: languageCode === "en"
        ? "First answer the other person's feelings, willingness, chance of action or contact, and possible way of moving forward. Do not turn the focus into the user's feelings except when giving boundaries or a next step."
        : "先回答问题中对方的感受、意愿、行动可能性、联系概率或推进方式；不要把重点转成用户的感受，除非最后给边界或行动提醒。"
    };
  }

  if (isSelfFocusedQuestion(safeQuestion)) {
    return {
      kind: "self_focus",
      primarySubject: languageCode === "en" ? "the user" : "用户",
      instruction: languageCode === "en"
        ? "The question asks about the user's own choice, state, or action. The user's feelings and next step may be the subject, but still answer the question itself first."
        : "问题询问用户自己的选择、状态或行动，可以把用户的感受和下一步作为解读主体，但仍要先回答问题本身。"
    };
  }

  return {
    kind: "question_event",
    primarySubject: languageCode === "en" ? "the question itself" : "问题本身",
    instruction: languageCode === "en"
      ? "Answer the event, relationship, or choice the user asked about first. Do not default to turning the reading into an analysis of the user's emotions."
      : "先回答用户问的事件、关系或选择本身；不要默认把解读改写成用户情绪分析。"
  };
}

function createQuestionScaleRequest(question, decisionOptions, language) {
  const safeQuestion = String(question || "").trim();
  const languageCode = normalizeLanguageCode(language);

  if (isLightEverydayQuestion(safeQuestion, decisionOptions)) {
    return {
      kind: "light_everyday_choice",
      instruction: languageCode === "en"
        ? "This is a low-risk everyday choice. Keep the reading lighter, shorter, and more concrete. You may give a leaning and card-based reason, but do not turn soda, coffee, snacks, or small purchases into trauma, life diagnosis, or deep emptiness. Avoid heavy metaphor. For two-card choices, summary max 2 sentences, each card max 2 sentences, overallMessage max 2 sentences, practicalReflection 1 sentence. Advice should land on waiting, buying less, drinking water first, or checking whether the user truly wants it."
        : "这是低风险日常小选择，读牌要轻一点、短一点、具体一点。可以给倾向和牌义理由，但不要把买可乐、喝咖啡、吃零食这类小问题写成情感创伤、人生诊断或深层空洞；不要使用过重隐喻；如果是双牌选择，summary 最多 2 句，每张牌最多 2 句，overallMessage 最多 2 句，practicalReflection 1 句；行动建议应落在等一等、少买一点、先喝水、确认自己是否真的想要。"
    };
  }

  return {
    kind: "normal",
    instruction: languageCode === "en"
      ? "Match the weight of the answer to the weight of the question: relationships, choices, and long-term concerns can go deeper; small matters should not be over-psychologized."
      : "按用户问题本身的重量来写：关系、选择和长期困扰可以深入；小事不要过度心理化。"
  };
}

function createDecisionOptionsRequest(spread, decisionOptions, language) {
  if (!spread || spread.id !== "decisionPair") {
    return null;
  }

  const languageCode = normalizeLanguageCode(language);
  const options = decisionOptions || {};
  const planA = String(options.planA || "").trim();
  const planB = String(options.planB || "").trim();
  const emptyA = languageCode === "en" ? "Plan A not filled in" : "未填写方案 A";
  const emptyB = languageCode === "en" ? "Plan B not filled in" : "未填写方案 B";

  return {
    planA: planA || emptyA,
    planB: planB || emptyB,
    options: [
      {
        position: languageCode === "en" ? "Plan A" : "方案 A",
        label: languageCode === "en" ? "Plan A" : "方案 A",
        text: planA || emptyA
      },
      {
        position: languageCode === "en" ? "Plan B" : "方案 B",
        label: languageCode === "en" ? "Plan B" : "方案 B",
        text: planB || emptyB
      }
    ]
  };
}

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
  const focus = questionFocus || createQuestionFocusRequest(safeQuestion);
  const scale = questionScale || createQuestionScaleRequest(safeQuestion);
  const cardCount = positions.length || 0;
  const isLightEveryday = scale.kind === "light_everyday_choice";
  const answer = answerGuidance || createAnswerGuidance(safeQuestion, spread);
  const isPhilosophical = focus.kind === "philosophical_symbolic";
  const isImaginalScene = focus.kind === "imaginal_scene";
  const baseGuidance = {
    questionFocus: `所有解释都要回到用户的问题：“${safeQuestion}”。${focus.instruction}`,
    questionScale: scale.instruction,
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

  if (spreadId === "oneCard") {
    const singleAnswerShape = answer.kind === "single_yes_no"
      ? "用一张牌直接回答此刻最重要的方向。只能把整体称为“这张牌”或“单牌”，不要写“三张牌”。这是是/否式问题，先说倾向，再解释这张牌的多个相关关键词如何共同落到问题上。如果牌面信号不是强烈的是或否，必须说明把它强行当成确定答案的风险。"
      : isImaginalScene
        ? "用一张牌直接展开用户提出的想象场景。只能把整体称为“这张牌”或“单牌”，不要写“三张牌”。先回答会看见、出现或遇见什么，再说明这张牌如何把关键词变成画面。不要写成“偏是/偏否/我会选”，也不要把画面强行改成现实生活建议。"
        : isPhilosophical
          ? "用一张牌直接回答用户提出的哲学命题。只能把整体称为“这张牌”或“单牌”，不要写“三张牌”。先给一个命题、悖论或象征性答案，再解释这张牌的多个相关关键词如何支持它。不要写成“偏是/偏否/我会选”，也不要把哲学问题强行改成个人生活建议。"
          : "用一张牌直接回答用户问的主题。只能把整体称为“这张牌”或“单牌”，不要写“三张牌”。这是开放式单牌问题，先说核心提醒或当前主线，不要写成“偏是/偏否/我会选”。再解释这张牌的多个相关关键词如何共同落到问题上。";
    const singleCardRole = answer.kind === "single_yes_no"
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
  const focus = questionFocus || createQuestionFocusRequest(safeQuestion, "en");
  const scale = questionScale || createQuestionScaleRequest(safeQuestion, decisionOptions, "en");
  const cardCount = positions.length || 0;
  const isLightEveryday = scale.kind === "light_everyday_choice";
  const answer = answerGuidance || createAnswerGuidance(safeQuestion, spread, "en");
  const isPhilosophical = focus.kind === "philosophical_symbolic";
  const isImaginalScene = focus.kind === "imaginal_scene";
  const baseGuidance = {
    questionFocus: `Every explanation must return to the user's question: "${safeQuestion}". ${focus.instruction}`,
    questionScale: scale.instruction,
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

  if (spreadId === "oneCard") {
    const singleAnswerShape = answer.kind === "single_yes_no"
      ? "Use one card to answer the most important direction right now. Refer to the reading as “this card” or “the single card,” never as a three-card reading. This is a yes/no-style question: give a leaning first, then explain how several relevant meanings of the card point that way. If the signal is not a strong yes or no, name the risk of treating it as certainty."
      : isImaginalScene
        ? "Use one card to open the imagined scene. Refer to the reading as “this card” or “the single card.” First answer what appears, is seen, or is met; then explain how the card turns its keywords into an image. Do not turn the scene into ordinary life advice."
        : isPhilosophical
          ? "Use one card to answer the philosophical proposition. Refer to the reading as “this card” or “the single card.” First give a proposition, paradox, or symbolic answer; then explain how several relevant card meanings support it. Do not turn the philosophical question into personal-life advice."
          : "Use one card to answer the user's theme. Refer to the reading as “this card” or “the single card.” This is an open-ended single-card question: give the core message or current main line first, not a forced yes/no answer. Then explain how the card's relevant meanings meet the question.";
    const singleCardRole = answer.kind === "single_yes_no"
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

function createAnswerGuidance(question, spread, language) {
  const safeQuestion = String(question || "").trim();
  const languageCode = normalizeLanguageCode(language);
  const protectedDomain = isProtectedAdviceQuestion(safeQuestion);
  const positions = spread && Array.isArray(spread.positions) ? spread.positions : [];
  const isSingleCard = positions.length === 1;
  const isDecisionPair = spread && spread.id === "decisionPair";
  const isYesNo = isLikelyYesNoQuestion(safeQuestion);
  const kind = isDecisionPair
    ? "decision_pair"
    : isSingleCard && isYesNo
      ? "single_yes_no"
      : "reflective";
  const shouldGivePreferredDirection = !protectedDomain && (
    kind === "single_yes_no" ||
      kind === "decision_pair"
  );

  return {
    kind,
    protectedDomain,
    shouldGivePreferredDirection,
    instruction: createAnswerGuidanceInstruction({
      kind,
      protectedDomain,
      shouldGivePreferredDirection,
      language: languageCode
    })
  };
}

function readingDirectionPromptGuidance(language) {
  const languageCode = normalizeLanguageCode(language);

  if (languageCode === "en") {
    return [
      "Write in this order: answer the question, give card evidence, integrate the spread, then give one small action or symbolic takeaway.",
      "summary must match the shape of the user's question: open-ended questions get a main line or state; only when answerGuidance.shouldGivePreferredDirection is true should you write what is more likely or which side you prefer.",
      "cards[].interpretation should sound like face-to-face explanation: how this card in this position affects the user's question, what meanings it carries, and what to notice.",
      "overallMessage should only explain the pattern these cards make together, not repeat each card; practicalReflection gives one testable, reversible action, philosophical echo, or symbolic takeaway according to spreadGuidance.",
      "Before writing, read questionFocus, questionScale, spreadGuidance, readerProfile.responseShape, answerGuidance, and language. Together they define subject, length, spread shape, reader voice, and output language.",
      "If questionFocus.kind is philosophical_symbolic, answer the philosophical question itself; if it is imaginal_scene, write the symbolic scene directly. Do not force either one back into personal life.",
      "If answerGuidance.shouldGivePreferredDirection is true, give a leaning first and then the risk. If false, do not turn an open-ended single-card question into yes/no.",
      "For one card, say “this card” or “the single card.” For two-option choices, name Plan A or Plan B and explain both upside and risk.",
      "Absorb the card keywords into the explanation, but do not turn them into a glossary. Ten of Wands should include burden, pressure, and overextension, not just responsibility.",
      "English should feel like a close friend speaking seriously: complete, fluent, specific, and direct. Do not create riddles for the sake of style.",
      "Final check: no reader-name signature, no leaked JSON/internal labels, no Chinese UI phrases in user-facing text, and no repeated analytical headings.",
      "If answerGuidance.protectedDomain is true, give reflective support and safety boundaries, not professional instructions."
    ].join(" ");
  }

  return [
    "按这个顺序写：先答问题，再给牌面证据，再整合牌阵，最后给一个小动作。",
    "summary 回答用户问的形状：开放式问题给主线或状态；只有 answerGuidance.shouldGivePreferredDirection 为 true 时，才写更可能怎样或更偏向哪边。",
    "cards[].interpretation 写成面对面说明：这张牌在这个牌位里怎样影响用户的问题，因为它带有什么牌义，所以现实里要注意什么。",
    "overallMessage 只讲这些牌合起来的模式，不要逐张复述；practicalReflection 只给一个可验证、可撤回的小动作。",
    "写作前先读 questionFocus、questionScale、spreadGuidance、readerProfile.responseShape、answerGuidance；它们共同决定主体、篇幅、牌阵形状和读牌人声音。",
    "如果 questionFocus.kind 是 philosophical_symbolic，回答哲学问题本身；如果是 imaginal_scene，直接写象征画面。不要把这两类问题强行拉回用户个人生活。",
    "如果 answerGuidance.shouldGivePreferredDirection 为 true，必须先给倾向，再说风险；如果为 false，不要把开放式单牌问题改写成是/否答案。",
    "单牌只说“这张牌/单牌”；双牌决策必须点名方案 A 或方案 B，并分别说明两边好处和风险。",
    "牌面关键词要被吸收进解释，但不要变成词条清单；权杖十这类牌不能只抓“责任”，还要读到负担、压力和过度承担。",
    "中文要像熟人认真说话。完整、顺口、具体；不要为了简短、精准或文学感写成谜语。",
    "最终自查：正文没有读牌人名字署名，没有内部英文术语，正逆位只写成中文，也没有把内部分析词当小标题。",
    "如果 answerGuidance.protectedDomain 为 true，只做反思性支持和安全边界，不给专业指令。"
  ].join(" ");
}

function createAnswerGuidanceInstruction({ kind, protectedDomain, shouldGivePreferredDirection, language }) {
  const languageCode = normalizeLanguageCode(language);

  if (protectedDomain) {
    return languageCode === "en"
      ? "If the question involves medical, legal, financial, or emergency risk, do not make a professional decision for the user. Give safety boundaries first, then use the cards only for reflection."
      : "问题涉及医疗、法律、财务或紧急风险时，不要替用户作专业决定；先给安全边界，再把牌义作为反思。";
  }

  if (!shouldGivePreferredDirection) {
    return languageCode === "en"
      ? "Keep the reading reflective. You may give a main line, state, reminder, symbol, or next step, but do not force a yes/no or two-option answer."
      : "保持反思性解读；可以给主线、状态、提醒或下一步，但不要强行制造是/否或二选一答案。";
  }

  if (kind === "single_yes_no") {
    return languageCode === "en"
      ? "This is a single-card yes/no question. Give a leaning first, using the selected reader's voice: Misty is gentle and restrained, Johnny is direct and clear, Donovan puts the clues on the table. Do not make all three readers use the same stock phrase. If the card is not a strong yes or no, explain the risk of treating it as certainty."
      : "这是单牌的是/否问题。必须先给一个倾向性回答，具体措辞要按读牌人格来写：Misty 温柔克制，Johnny 直接尖锐，Donovan 像把线索摊在桌上的人。不要让三位读牌人使用同一套通用句式。如果牌面不是强烈的是或否，必须说明把它强行当成确定答案的风险，再解释不确定性。";
  }

  if (kind === "decision_pair") {
    return languageCode === "en"
      ? "This is a two-card decision question. Compare the two options and give a preferred side, while naming both upside and risk for each option. Do not only praise the chosen side, and do not make both options sound perfectly equal."
      : "这是双牌决策问题。必须比较两个选项，并给出更偏向的选择；但每个选项都要写好处和风险。不要只夸被选择的一边，也不要把两个选项写成完全等权。";
  }

  return languageCode === "en"
    ? "You may give a gentle direction while keeping the user's agency intact."
    : "可以给一个温和方向，但保留用户的选择权。";
}

function createDirectionalFallback({
  safeQuestion,
  spread,
  drawnCards,
  primaryThemes,
  questionFocus,
  answerGuidance,
  readerProfile,
  language
}) {
  const languageCode = normalizeLanguageCode(language);
  const sharp = isSharpReader(readerProfile);
  const donovan = isDonovanReader(readerProfile);

  if (!answerGuidance.shouldGivePreferredDirection) {
    return {};
  }

  if (answerGuidance.kind === "single_yes_no") {
    const drawn = drawnCards[0];
    const direction = getSingleCardFallbackDirection(drawn, questionFocus, languageCode);
    const readerDirectionSummary = createReaderDirectionSummary(direction, questionFocus, readerProfile, languageCode);
    const themeSubject = languageCode === "en"
      ? (drawnCards.length === 1 ? "this card" : "these cards")
      : (drawnCards.length === 1 ? "这张牌" : "这组牌");

    if (languageCode === "en") {
      return {
        summary: donovan
          ? `About “${safeQuestion},” let me put it on the table: ${readerDirectionSummary}. This is not an order; it is the clue the card is handing you.`
          : sharp
          ? `About “${safeQuestion},” ${readerDirectionSummary}. Do not treat it as a verdict; treat it as the direction you were trying to dodge.`
          : `About “${safeQuestion},” ${readerDirectionSummary}. It is not an absolute prediction, but it gives you a direction you can test first.`,
        overallMessage: donovan
          ? `${direction.overallMessage} The focus of ${themeSubject} is ${primaryThemes}. See the cost clearly before you put weight on the next step.`
          : sharp
          ? `${direction.overallMessage} ${themeSubject} pushes the focus toward ${primaryThemes}. Use real feedback instead of dressing hesitation up as deep thought.`
          : `${direction.overallMessage} The theme of ${themeSubject} is ${primaryThemes}. Treat the leaning as a small test, not an irreversible sentence.`,
        practicalReflection: donovan
          ? `${direction.practicalReflection} ${direction.riskNote} Treating a soft signal as proof gives away your agency; professional-risk questions belong with professionals.`
          : sharp
          ? `${direction.practicalReflection} ${direction.riskNote} Do not jump into something irreversible; medical, legal, financial, or emergency matters need professionals.`
          : `${direction.practicalReflection} ${direction.riskNote} For medical, legal, financial, or emergency matters, follow qualified professional guidance.`,
        journalQuestion: donovan
          ? `If you take one step toward “${direction.shortLabel},” what cost are you least willing to admit?`
          : sharp
          ? `If you take one step toward “${direction.shortLabel},” which excuse will be the first one to stop you?`
          : `If you test “${direction.shortLabel}” in the smallest reversible way, what would that step be?`
      };
    }

    return {
      summary: donovan
        ? `关于“${safeQuestion}”，${readerDirectionSummary}。这不是命令，是牌面递过来的情报。`
        : sharp
        ? `关于“${safeQuestion}”，${readerDirectionSummary}。别把这当审判；它只是把你想绕开的方向标出来。`
        : `关于“${safeQuestion}”，${readerDirectionSummary}。这不是绝对预言，但它给了一个可以先采用的方向。`,
      overallMessage: donovan
        ? `${direction.overallMessage}${themeSubject}的重点落在${primaryThemes}。先看清代价，再决定要不要往前押一步。`
        : sharp
        ? `${direction.overallMessage}${themeSubject}把重点推到${primaryThemes}。别继续把犹豫包装成深思，先用现实反馈验一下。`
        : `${direction.overallMessage}${themeSubject}的主题落在${primaryThemes}。先把这个倾向当作小步测试，而不是不可逆的判决。`,
      practicalReflection: donovan
        ? `${direction.practicalReflection}${direction.riskNote}把软信号当铁证，容易把选择权交出去；专业风险问题交给专业人士。`
        : sharp
        ? `${direction.practicalReflection}${direction.riskNote}别跳进不可逆的坑；医疗、法律、财务或紧急事项交给专业人士。`
        : `${direction.practicalReflection}${direction.riskNote}如果问题涉及医疗、法律、财务或紧急事项，请以合格专业人士的意见为准。`,
      journalQuestion: donovan
        ? `如果按“${direction.shortLabel}”走一步，哪一笔代价你现在最不想承认？`
        : sharp
        ? `如果你按“${direction.shortLabel}”走一步，哪一个借口会第一个站出来拦你？`
        : `如果你先按“${direction.shortLabel}”的方向试探一步，最小、最可逆的行动是什么？`
    };
  }

  if (answerGuidance.kind === "decision_pair") {
    const preferred = getPreferredDecisionCard(drawnCards);
    const alternative = getAlternativeDecisionCard(drawnCards, preferred);
    const decisionShape = getDecisionPairShape(drawnCards, languageCode);

    if (!preferred) {
      return {};
    }

    if (languageCode === "en") {
      return {
        summary: donovan
          ? `About “${safeQuestion},” I would lean toward ${preferred.position}. ${decisionShape.summary} It wins because the cost is more honest, not because it has no risk.`
          : sharp
          ? `About “${safeQuestion},” I would lean toward ${preferred.position}. ${decisionShape.summary} Do not stare only at the pretty part; it still has a bill attached.`
          : `About “${safeQuestion},” this two-card spread leans toward ${preferred.position}. ${decisionShape.summary} It is not an order; that side simply has clearer conditions.`,
        overallMessage: donovan
          ? `If you need one direction first, look at ${preferred.position}. Its upside is ${summarizeDecisionUpside(preferred, languageCode)}, and its cost is ${summarizeDecisionRisk(preferred, languageCode)}; ${alternative ? `${alternative.position}'s upside is ${summarizeDecisionUpside(alternative, languageCode)}, and its cost is ${summarizeDecisionRisk(alternative, languageCode)}.` : ""} The shared theme is ${primaryThemes}.`
          : sharp
          ? `If you need one direction first, look at ${preferred.position}, but its risk is ${summarizeDecisionRisk(preferred, languageCode)}; ${alternative ? `${alternative.position}'s upside is ${summarizeDecisionUpside(alternative, languageCode)}, and its risk is ${summarizeDecisionRisk(alternative, languageCode)}.` : ""} The shared theme is ${primaryThemes}.`
          : `If you need one direction first, I would look toward ${preferred.position}. Its upside is ${summarizeDecisionUpside(preferred, languageCode)}, and its risk is ${summarizeDecisionRisk(preferred, languageCode)}; ${alternative ? `${alternative.position}'s upside is ${summarizeDecisionUpside(alternative, languageCode)}, and its risk is ${summarizeDecisionRisk(alternative, languageCode)}.` : ""} The shared theme is ${primaryThemes}.`,
        practicalReflection: donovan
          ? `Give ${preferred.position} a small real-world test; do not stake everything at once. Medical, legal, financial, or emergency matters need professionals, not bravado from a reading.`
          : sharp
          ? `Give ${preferred.position} a small real-world test before you put everything on it. Medical, legal, financial, or emergency matters need professionals, not bravado from a reading.`
          : `Design a low-risk test for ${preferred.position}: one small step you can reverse and review. Do not use this as medical, legal, financial, or emergency advice.`,
        journalQuestion: donovan
          ? `If you choose ${preferred.position}, what cost has to be spoken out loud before the cards stop borrowing your agency?`
          : sharp
          ? `If you choose ${preferred.position}, what cost are you least eager to admit?`
          : `If you choose ${preferred.position}, what exit or boundary would keep you feeling free?`
      };
    }

    return {
      summary: donovan
        ? `关于“${safeQuestion}”，我会更偏向${preferred.position}。${decisionShape.summary}它赢在代价更诚实，不是赢在没有风险。`
        : sharp
        ? `关于“${safeQuestion}”，我会更偏向${preferred.position}。${decisionShape.summary}别只盯它好看的部分，它也有后续成本。`
        : `关于“${safeQuestion}”，这组双牌更偏向${preferred.position}。${decisionShape.summary}它不是命令，只是这一边的条件更清楚。`,
      overallMessage: donovan
        ? `如果必须先选一个方向，优先看${preferred.position}。它的好处是${summarizeDecisionUpside(preferred)}，代价是${summarizeDecisionRisk(preferred)}；${alternative ? `${alternative.position}的好处是${summarizeDecisionUpside(alternative)}，代价是${summarizeDecisionRisk(alternative)}。` : ""}共同主题是：${primaryThemes}。`
        : sharp
        ? `如果必须先选一个方向，优先看${preferred.position}，但它的风险是${summarizeDecisionRisk(preferred)}；${alternative ? `${alternative.position}的好处是${summarizeDecisionUpside(alternative)}，风险是${summarizeDecisionRisk(alternative)}。` : ""}共同主题是：${primaryThemes}。`
        : `如果必须先选一个方向，我会优先看向${preferred.position}。它的好处是${summarizeDecisionUpside(preferred)}，风险是${summarizeDecisionRisk(preferred)}；${alternative ? `${alternative.position}的好处是${summarizeDecisionUpside(alternative)}，风险是${summarizeDecisionRisk(alternative)}。` : ""}共同主题是：${primaryThemes}。`,
      practicalReflection: donovan
        ? `给${preferred.position}一个小型现实测试，别一次押上全部筹码。医疗、法律、财务或紧急事务别听牌面逞强。`
        : sharp
        ? `给${preferred.position}一个小型现实测试，别直接押上全部筹码。医疗、法律、财务或紧急事务别听牌面逞强。`
        : `先为${preferred.position}设计一个低风险试探：只做能撤回、能复盘的一小步。不要把本解读当作医疗、法律、财务或紧急事务建议。`,
      journalQuestion: donovan
        ? `如果选择${preferred.position}，哪一个代价你必须先讲清楚，才不是把自由意志外包给牌面？`
        : sharp
        ? `如果选择${preferred.position}，你最不想承认的成本是什么？`
        : `如果选择${preferred.position}，你需要保留哪一个退路，才会觉得自己仍然自由？`
    };
  }

  return {};
}

function createFallbackCardInterpretation(drawn, readerProfile, language) {
  const languageCode = normalizeLanguageCode(language);
  const orientationText = formatOrientation(drawn.orientation, languageCode);
  const keywords = drawn.keywords.join(getLanguageConfig(languageCode).keywordJoiner);

  if (languageCode === "en") {
    if (isDonovanReader(readerProfile)) {
      return `${drawn.card.name} ${orientationText} lands in “${drawn.position}” and brings ${keywords} into the matter. It asks you to trust concrete words and actions more than hints; the next step is to answer what is clear, not complete what is silent.`;
    }

    if (isSharpReader(readerProfile)) {
      return `${drawn.card.name} ${orientationText} lands in “${drawn.position}” and brings out ${keywords}. This card is not here to comfort you; it points at the cost you may be trying to understate.`;
    }

    return `${drawn.card.name} ${orientationText} appears in “${drawn.position}” and gently brings in ${keywords}. Treat it as a symbol for reflection, not a fixed prediction.`;
  }

  if (isDonovanReader(readerProfile)) {
    return `${drawn.card.name}${orientationText}落在“${drawn.position}”，把${keywords}带进这件事里。它提醒你少看暗示，多看谁真的把话说清、把动作做出来；下一步只认具体行动，别替含糊补剧情。`;
  }

  if (isSharpReader(readerProfile)) {
    return `${drawn.card.name}${orientationText}落在“${drawn.position}”，把${keywords}这几层意思推出来。这张牌不负责哄你，它更像把你正在回避的成本圈出来。`;
  }

  return `${drawn.card.name}${orientationText}出现在“${drawn.position}”，把${keywords}轻轻带进这个问题里。它更适合作为反思的象征，而不是固定的预言。`;
}

function createGeneralFallbackSummary(safeQuestion, readerProfile, language) {
  if (normalizeLanguageCode(language) === "en") {
    if (isDonovanReader(readerProfile)) {
      return `About “${safeQuestion},” let me put it on the table: these cards will not sign for fate. They ask what has not been said clearly, who has not acted, and which piece of agency you can take back first.`;
    }

    if (isSharpReader(readerProfile)) {
      return `About “${safeQuestion},” these cards are not rushing to comfort you. They push the part you may be understating back onto the table.`;
    }

    return `About “${safeQuestion},” this spread asks you to notice the pattern underneath the situation before deciding the next step.`;
  }

  if (isDonovanReader(readerProfile)) {
    return `关于“${safeQuestion}”，先把话放在桌上：这组牌不会替命运签字，它只提醒你看清哪里没说透、哪里没有行动，以及你能先收回哪一步。`;
  }

  if (isSharpReader(readerProfile)) {
    return `关于“${safeQuestion}”，这组牌先不急着安慰你；它更像把问题里被你说轻了的部分推到桌面上。`;
  }

  return `关于“${safeQuestion}”，这个牌阵提示你先看清局面背后的模式，再决定下一步。`;
}

function createGeneralFallbackOverall(primaryThemes, readerProfile, language) {
  if (normalizeLanguageCode(language) === "en") {
    if (isDonovanReader(readerProfile)) {
      return `Together, these cards land on ${primaryThemes}. The point is not who says the prettiest thing, but who acts clearly, who speaks plainly, and where you need to take back agency.`;
    }

    if (isSharpReader(readerProfile)) {
      return `Together, these cards point to ${primaryThemes}. Stop looking for a prettier explanation and look at the most inconvenient fact first.`;
    }

    return `Together, these cards point to ${primaryThemes}. Notice where you feel most tense or invested; that may be where this reading becomes useful.`;
  }

  if (isDonovanReader(readerProfile)) {
    return `这些牌共同落在${primaryThemes}。关键不是把话说得好听，而是谁真的做了动作、谁把话说清，以及你要先把哪块主动权拿回来。`;
  }

  if (isSharpReader(readerProfile)) {
    return `这些牌共同指向：${primaryThemes}。别急着找一个漂亮说法，先看清哪一个事实最不方便。`;
  }

  return `这些牌共同指向：${primaryThemes}。留意你最紧绷、最在意的地方，那里可能正是这次解读真正有用的位置。`;
}

function createGeneralFallbackPractical(readerProfile, language) {
  if (normalizeLanguageCode(language) === "en") {
    if (isDonovanReader(readerProfile)) {
      return "Take one small action that gives agency back: check one fewer signal tonight, or respond only to clear words. Do not treat this as medical, legal, financial, or emergency advice.";
    }

    if (isSharpReader(readerProfile)) {
      return "Do one small, testable thing instead of using imagination as evidence. Do not treat this as medical, legal, financial, or emergency advice.";
    }

    return "Choose one small, reversible action that answers the clearest reminder in the spread. Do not treat this as medical, legal, financial, or emergency advice.";
  }

  if (isDonovanReader(readerProfile)) {
    return "先做一个能夺回主动权的小动作：今晚少看一个消息来源，或只回应清楚表达。不要把本解读当作医疗、法律、财务或紧急事务建议。";
  }

  if (isSharpReader(readerProfile)) {
    return "做一个小而可验证的行动，别继续用想象替代证据。不要把本解读当作医疗、法律、财务或紧急事务建议。";
  }

  return "选择一个小而可逆的行动，回应牌阵里最清楚的提醒。不要把本解读当作医疗、法律、财务或紧急事务建议。";
}

function createGeneralFallbackJournal(safeQuestion, readerProfile, language) {
  if (normalizeLanguageCode(language) === "en") {
    if (isDonovanReader(readerProfile)) {
      return `About “${safeQuestion},” what piece of agency have you already handed away, and what can you take back tonight?`;
    }

    if (isSharpReader(readerProfile)) {
      return `About “${safeQuestion},” if you stopped making excuses for yourself, would the next step become clearer or sharper?`;
    }

    return `If you brought more honesty, patience, and room for uncertainty to “${safeQuestion},” what would change?`;
  }

  if (isDonovanReader(readerProfile)) {
    return `关于“${safeQuestion}”，哪一块主动权你已经交出去了，但其实今晚可以先拿回来？`;
  }

  if (isSharpReader(readerProfile)) {
    return `关于“${safeQuestion}”，如果你停止替自己找借口，下一步会变得更清楚还是更刺耳？`;
  }

  return `如果你带着更多诚实、耐心和不确定性的空间来看待“${safeQuestion}”，会有什么改变？`;
}

function createReaderDirectionSummary(direction, questionFocus, readerProfile, language) {
  if (normalizeLanguageCode(language) === "en") {
    if (isDonovanReader(readerProfile)) {
      if (questionFocus && questionFocus.kind === "third_party_action") {
        if (direction.shortLabel === "low chance of contact") {
          return "the chance of contact is low. Silence is also a clue, so do not write dialogue for it";
        }

        return "there is still a window for a small test, but do not mistake a test for a promise";
      }

      if (direction.shortLabel === "lean no or pause") {
        return "I lean no. Not because it is impossible, but because there is too little action right now; pause and observe";
      }

      return "I lean yes, but test it in a small way instead of putting everything on it";
    }

    if (isSharpReader(readerProfile)) {
      if (questionFocus && questionFocus.kind === "third_party_action") {
        if (direction.shortLabel === "low chance of contact") {
          return "I am not optimistic. Their initiative is weak, so do not write love letters for their silence";
        }

        return "there is a window. Do not pretend there is no signal, but do not act on their behalf either";
      }

      if (direction.shortLabel === "lean no or pause") {
        return "I lean no. At least right now, this is not where you rush in";
      }

      return "I lean yes. Do not pretend there is no signal, but test it small";
    }

    return direction.summary;
  }

  if (isDonovanReader(readerProfile)) {
    if (questionFocus && questionFocus.kind === "third_party_action") {
      if (direction.shortLabel === "对方联系概率低") {
        return "先把话放在桌上：对方联系概率偏低。沉默本身也是一条情报，别替它加台词";
      }

      return "先把话放在桌上：对方仍有试探窗口，但别把试探当承诺";
    }

    if (direction.shortLabel === "偏否或暂缓") {
      return "我会偏向于不是。不是没可能，是现在的动作太少；更适合暂缓、再观察";
    }

    return "先把话放在桌上：偏是，但用小步验证，别一次押上全部筹码";
  }

  if (isSharpReader(readerProfile)) {
    if (questionFocus && questionFocus.kind === "third_party_action") {
      if (direction.shortLabel === "对方联系概率低") {
        return "偏不乐观。对方主动性不够，别替沉默写情书";
      }

      return "偏有窗口。别装作这完全没信号，但也别替对方完成行动";
    }

    if (direction.shortLabel === "偏否或暂缓") {
      return "偏否。至少现在不是你冲进去的时候";
    }

    return "偏是。别装作这完全没信号，但先小步验证";
  }

  return direction.summary;
}

function getSingleCardFallbackDirection(drawn, questionFocus, language) {
  if (normalizeLanguageCode(language) === "en") {
    if (questionFocus && questionFocus.kind === "third_party_action") {
      if (drawn && drawn.orientation === "reversed") {
        return {
          shortLabel: "low chance of contact",
          summary: "I would lean toward them not reaching out in the short term, or toward their willingness being held back by hesitation, resistance, or self-protection",
          overallMessage: "If I have to give a leaning, I would read the chance of contact as low; the point is not how much you want to wait, but that their initiative is not stable enough yet.",
          practicalReflection: "Watch for clear, continuous small actions instead of reading scattered signals as a definite return.",
          riskNote: "The risk is that treating this as an absolute no may miss later change, while treating it as a definite yes may turn waiting into exhaustion."
        };
      }

      return {
        shortLabel: "there is a contact window",
        summary: "I would lean toward them still having some willingness or a window to test contact, but it looks slow rather than immediately stable",
        overallMessage: "If I have to give a leaning, I would read action as possible; the focus is their willingness and pace, not just your hope.",
        practicalReflection: "Notice whether they make a specific, verifiable move; respond to clear action, not vague signals.",
        riskNote: "The risk is that treating it as certain may overestimate their follow-through, while treating it as impossible may miss a window that is still forming."
      };
    }

    if (drawn && drawn.orientation === "reversed") {
      return {
        shortLabel: "lean no or pause",
        summary: "I would lean no, or at least pause and watch",
        overallMessage: "If I have to give a leaning, I would lean no for now and slow the situation down instead of agreeing or pushing ahead.",
        practicalReflection: "Name one concrete condition that makes you hesitate; if that condition does not improve, do not move forward yet.",
        riskNote: "The risk is that treating this as an absolute no may miss a repairable chance, while treating it as yes may ignore resistance already showing."
      };
    }

    return {
      shortLabel: "lean yes",
      summary: "I would lean yes, or toward trying one step forward",
      overallMessage: "If I have to give a leaning, I would say you can move forward, but only in a small and reversible way.",
      practicalReflection: "Try one small step and let real feedback test the direction this card is pointing toward.",
      riskNote: "The risk is that treating it as an absolute yes may ignore conditions that are not ready, while treating it as no may miss an opening."
    };
  }

  if (questionFocus && questionFocus.kind === "third_party_action") {
    if (drawn && drawn.orientation === "reversed") {
      return {
        shortLabel: "对方短期偏不主动",
        summary: "我会偏向于对方短期不会主动联系，或联系意愿被犹豫、阻力和自我保护压住",
        overallMessage: "如果要给一个倾向，我会偏向联系概率较低；重点不是你有多想等，而是对方的主动性暂时不够稳定。",
        practicalReflection: "先观察对方是否有清晰、连续的小动作，而不是把零散信号读成确定回头。",
        riskNote: "风险在于：把它当成绝对不会，可能错过后续变化；把它当成一定会，则可能把等待变成消耗。"
      };
    }

    return {
      shortLabel: "对方有联系窗口",
      summary: "我会倾向于对方仍有联系意愿或试探窗口，但更像慢热推进，不像立刻稳定回归",
      overallMessage: "如果要给一个倾向，我会偏向对方有动作的可能；重点是对方的意愿和行动节奏，而不是只分析你的期待。",
      practicalReflection: "留意对方是否出现具体、可验证的联系动作；只回应清楚的行动，不替含糊信号补剧情。",
      riskNote: "风险在于：把它当成绝对会，可能高估对方执行力；把它当成不会，则可能忽略一个仍在形成的窗口。"
    };
  }

  if (drawn && drawn.orientation === "reversed") {
    return {
      shortLabel: "偏否或暂缓",
      summary: "我会偏向于不是，给我的感觉是否定的；更适合暂缓、再观察",
      overallMessage: "如果要给一个倾向，我会偏否，建议先慢下来，不要急着答应或推进。",
      practicalReflection: "先找出一个让你犹豫的具体条件；如果这个条件没有改善，就暂时不要推进。",
      riskNote: "风险在于：把它当成绝对的“不”，可能错过仍可修正的小机会；把它当成“是”，则可能无视已经出现的阻力。"
    };
  }

  return {
    shortLabel: "偏是",
    summary: "我会倾向于“是”或“可以往前试一步”",
    overallMessage: "如果要给一个倾向，我会偏向可以推进，但用小步、可撤回的方式推进。",
    practicalReflection: "先做一个小而可逆的尝试，用现实反馈确认这张牌给出的方向。",
    riskNote: "风险在于：把它当成绝对的“是”，可能忽略条件还没成熟；把它当成“不”，则可能错过正在打开的窗口。"
  };
}

function getPreferredDecisionCard(drawnCards) {
  if (!Array.isArray(drawnCards) || drawnCards.length < 2) {
    return null;
  }

  const scoredCards = drawnCards.slice(0, 2).map((drawn, index) => ({
    drawn,
    score: (drawn.orientation === "upright" ? 2 : 0) - index * 0.1
  }));

  scoredCards.sort((left, right) => right.score - left.score);
  return scoredCards[0].drawn;
}

function getAlternativeDecisionCard(drawnCards, preferred) {
  if (!Array.isArray(drawnCards) || !preferred) {
    return null;
  }

  return drawnCards.slice(0, 2).find((drawn) => drawn.id !== preferred.id) || null;
}

function getDecisionPairShape(drawnCards, language) {
  const cards = Array.isArray(drawnCards) ? drawnCards.slice(0, 2) : [];
  const uprightCount = cards.filter((drawn) => drawn.orientation === "upright").length;
  const languageCode = normalizeLanguageCode(language);

  if (uprightCount === 0) {
    return {
      summary: languageCode === "en"
        ? "Neither side is clean; this is more about which cost is more manageable."
        : "两边都不算干净，更像是在比较哪一个代价更可控。"
    };
  }

  if (uprightCount === 2) {
    return {
      summary: languageCode === "en"
        ? "Both sides have something workable, so the point is not which one is perfect, but which one fits the current question better."
        : "两边都有可取处，所以重点不是谁完美，而是谁更贴合现在的问题。"
    };
  }

  return {
    summary: languageCode === "en"
      ? "One side moves more easily and the other needs more conditions; the point is to see the risk beside the benefit."
      : "一边更顺，一边更需要补条件；重点是看清收益旁边的风险。"
  };
}

function summarizeDecisionUpside(drawn, language) {
  const keywords = Array.isArray(drawn && drawn.keywords) ? drawn.keywords : [];
  const languageCode = normalizeLanguageCode(language);
  const mainKeyword = keywords[0] || (languageCode === "en" ? "the card's main line" : "牌面主线");

  if (drawn && drawn.orientation === "reversed") {
    return languageCode === "en"
      ? `it may expose ${mainKeyword}, letting you correct the issue before rushing in`
      : `它可能暴露${mainKeyword}这个问题，让你先修正而不是盲冲`;
  }

  return languageCode === "en"
    ? `it carries support from ${mainKeyword}, making forward movement easier`
    : `它带着${mainKeyword}的支持，比较容易形成正向推进`;
}

function summarizeDecisionRisk(drawn, language) {
  const keywords = Array.isArray(drawn && drawn.keywords) ? drawn.keywords : [];
  const languageCode = normalizeLanguageCode(language);
  const riskKeyword = keywords[1] || keywords[0] || (languageCode === "en" ? "the card's warning" : "牌面提醒");

  if (drawn && drawn.orientation === "reversed") {
    return languageCode === "en"
      ? `${riskKeyword} may be amplified, so this choice needs conditions repaired first`
      : `${riskKeyword}可能放大，选择它需要先补条件`;
  }

  return languageCode === "en"
    ? `trusting ${riskKeyword} too much may make you underestimate the work or later cost`
    : `太相信${riskKeyword}，可能会低估执行成本或后续代价`;
}

function isLikelyYesNoQuestion(question) {
  const text = String(question || "").trim();

  return /[吗么]\s*[?？]?\s*$/.test(text) ||
    /(该不该|要不要|是否|是不是|能不能|可不可以|会不会|有没有|应不应该|愿不愿意|想不想)/.test(text) ||
    /^(我该不该|该不该|要不要|是否|是不是|能不能|可不可以|会不会|有没有|应不应该|should\b|will\b|can\b|could\b|would\b|do\b|does\b|did\b|is\b|are\b|am\b|was\b|were\b|have\b|has\b)/i.test(text);
}

function isPhilosophicalQuestion(question) {
  const text = String(question || "").trim();

  if (!text || isProtectedAdviceQuestion(text)) {
    return false;
  }

  return /(为什么.*(人|human|humans|存在|世界|命运|名单|list|活着|死亡|灵魂|意识|自由|选择)|为何.*(人|存在|世界|命运|名单|活着|灵魂|意识)|meaning of|meaningless|existence|existential|why human|why humans|why am i|why are we|why not something else|why not.*else|tight little world|on the list|what is the point|what makes us human)/i.test(text);
}

function isImaginalSceneQuestion(question) {
  const text = String(question || "").trim();

  if (!text || isProtectedAdviceQuestion(text)) {
    return false;
  }

  return /(jumped? in the river|jumped? into the river|cross(ed)? the woods|walk(ed)? through the woods|enter(ed)? the forest|what will i see|what appears?|what will appear|what do i meet|what waits there|梦里|梦见|想象|河里会看见|跳进河|跳入河|走进森林|穿过森林|穿过树林|树林.*出现|森林.*出现|会看到什么|会看见什么|会出现什么|会遇见什么|出现什么)/i.test(text);
}

function isThirdPartyActionQuestion(question) {
  const text = String(question || "").trim();

  if (!text) {
    return false;
  }

  const hasThirdPartySubject = /(前任|前男友|前女友|ex\b|对方|他|她|ta\b|TA|男友|女友|对象|暧昧对象|crush|喜欢的人|某人|朋友|同事|老板|客户)/i.test(text);
  const asksInnerStateOrAction = /(会不会|还会|是否|会|想不想|愿不愿意|可能|打算|准备|主动|联系|找我|回来|复合|回头|道歉|表白|喜欢|爱|想念|在意|行动|推进|见面|回复|消息)/i.test(text);

  return hasThirdPartySubject && asksInnerStateOrAction && !isSelfFocusedQuestion(text);
}

function isSelfFocusedQuestion(question) {
  return /(我应该|我该|我要不要|我要|我能不能|我可不可以|我是否|我是不是|我会不会|我的感受|我的状态|我的选择|我怎么|我怎样|我如何|should i\b|can i\b|will i\b|am i\b)/i.test(String(question || ""));
}

function isProtectedAdviceQuestion(question) {
  return /(医疗|医生|药|诊断|治疗|手术|怀孕|法律|律师|起诉|合同|财务|金融|投资|股票|基金|借贷|贷款|保险|税务|急救|紧急|报警|自杀|轻生|伤害|medical|doctor|legal|lawyer|financial|finance|invest|stock|crypto|tax|emergency|suicide|self-harm)/i.test(String(question || ""));
}

function isLightEverydayQuestion(question, decisionOptions) {
  const text = String(question || "").trim();
  const optionText = decisionOptions && Array.isArray(decisionOptions.options)
    ? decisionOptions.options.map((option) => option.text).join(" ")
    : "";
  const combinedText = `${text} ${optionText}`.trim();

  if (!combinedText || isProtectedAdviceQuestion(combinedText)) {
    return false;
  }

  const asksSmallAction = /(要不要|该不该|可不可以|能不能|想不想|买|喝|吃|点|订|拿|来一杯|来一瓶)/.test(text);
  const asksChoice = /(选|选择|哪个|哪一个|哪种|方案|A|B|还是)/i.test(text);
  const everydayObject = /(可乐|汽水|饮料|奶茶|咖啡|茶|零食|薯片|甜品|蛋糕|冰淇淋|外卖|宵夜|晚饭|午饭|早餐|糖|巧克力|饼干|小吃|啤酒|柠檬糖)/.test(combinedText);
  const optionHasEverydayObject = /(可乐|汽水|饮料|奶茶|咖啡|茶|零食|薯片|甜品|蛋糕|冰淇淋|外卖|宵夜|晚饭|午饭|早餐|糖|巧克力|饼干|小吃|啤酒|柠檬糖)/.test(optionText);

  return everydayObject && (
    (text.length <= 40 && asksSmallAction) ||
      (optionHasEverydayObject && asksChoice)
  );
}

function assertValidReading(rawReading, expectedRequest) {
  const validationError = getReadingValidationError(rawReading, expectedRequest);

  if (validationError) {
    throw createInvalidReadingError(`AI 解读 JSON 无效：${validationError}`);
  }

  return rawReading;
}

function createInvalidReadingError(message) {
  const error = new Error(message || "AI 解读 JSON 无效。");

  error.code = "INVALID_AI_READING_JSON";
  error.retryableReadingFormat = true;
  return error;
}

function isRetryableReadingFormatError(error) {
  return Boolean(
    error &&
      (error.retryableReadingFormat || error.code === "INVALID_AI_READING_JSON")
  );
}

function getReadingValidationError(reading, expectedRequest) {
  if (!reading || typeof reading !== "object" || Array.isArray(reading)) {
    return "顶层结果必须是 JSON object";
  }

  if (reading.schemaVersion !== READING_SCHEMA_VERSION) {
    return "schemaVersion 不匹配";
  }

  const requiredTextFields = [
    "sourceLabel",
    "summary",
    "overallMessage",
    "practicalReflection",
    "journalQuestion",
    "caveat"
  ];

  for (let index = 0; index < requiredTextFields.length; index += 1) {
    const field = requiredTextFields[index];

    if (!isNonEmptyString(reading[field])) {
      return `${field} 必须是非空字符串`;
    }
  }

  if (!Array.isArray(reading.cards)) {
    return "cards 必须是数组";
  }

  const expectedCards =
    expectedRequest && Array.isArray(expectedRequest.drawnCards)
      ? expectedRequest.drawnCards
      : [];

  if (expectedCards.length && reading.cards.length !== expectedCards.length) {
    return "cards 数量必须与已抽牌数量一致";
  }

  for (let index = 0; index < reading.cards.length; index += 1) {
    const validationError = getReadingCardValidationError(
      reading.cards[index],
      expectedCards[index],
      index
    );

    if (validationError) {
      return validationError;
    }
  }

  const styleValidationError = getReadingStyleValidationError(reading, expectedRequest);

  if (styleValidationError) {
    return styleValidationError;
  }

  return "";
}

function getReadingCardValidationError(card, expectedCard, index) {
  if (!card || typeof card !== "object" || Array.isArray(card)) {
    return `cards[${index}] 必须是 JSON object`;
  }

  if (!isNonEmptyString(card.id)) {
    return `cards[${index}].id 必须是非空字符串`;
  }

  if (!isNonEmptyString(card.interpretation)) {
    return `cards[${index}].interpretation 必须是非空字符串`;
  }

  if (expectedCard && card.id !== expectedCard.id) {
    return `cards[${index}].id 必须与对应已抽牌一致`;
  }

  return "";
}

function getReadingStyleValidationError(reading, expectedRequest) {
  const languageCode = normalizeLanguageCode(expectedRequest && expectedRequest.language);
  const languageConfig = getLanguageConfig(languageCode);

  if (!String(reading.caveat || "").includes(languageConfig.safetyCaveat)) {
    return "caveat 必须包含安全提示";
  }

  const textFields = collectUserFacingReadingText(reading);
  const combinedText = textFields.map((field) => field.text).join("\n");
  const expectedCardCount =
    expectedRequest && Array.isArray(expectedRequest.drawnCards)
      ? expectedRequest.drawnCards.length
      : 0;

  if (/(Johnny|Misty|Donovan)\s*(的判断是|会说|觉得|认为|表示|的感觉是)/i.test(combinedText) ||
      /\b(Johnny|Misty|Donovan)'?s\s+(judgment|reading|feeling|view|take)\s+(is|says|would be)/i.test(combinedText)) {
    return "正文不得使用读牌人名字署名";
  }

  if (/(^|[。！？!?；;\n]\s*)(线索是|动机是|问题是|代价是|动作上)\s*[：:]/.test(combinedText)) {
    return "正文不得暴露分析标签骨架";
  }

  if (languageCode === "zh" && /\b(upright|reversed|yes\/no|schemaVersion|sourceLabel|drawnCards)\b/i.test(combinedText)) {
    return "正文不得暴露内部英文术语";
  }

  if (languageCode === "en" && /(正位|逆位|AI生成内容|仅供娱乐|自我反思|整体讯息|行动提醒|方案 A|方案 B)/.test(combinedText)) {
    return "English readings must not leak Chinese UI or prompt phrases";
  }

  if (expectedCardCount === 1 && /三张牌|这几张牌|这些牌/.test(combinedText)) {
    return "单牌解读不得写成多牌";
  }

  if (isOpenSingleCardRequest(expectedRequest)) {
    const directionalText = `${reading.summary || ""}\n${reading.overallMessage || ""}`;

    if (/(我会更?偏向于?(是|不是)|我会倾向于[“"]?(是|不是)|偏是|偏否|给我的感觉是?(肯定|否定)|我会选|我更偏向方案)/.test(directionalText) ||
        /\b(I would|I'd|I)\s+(lean|choose|pick)\s+(yes|no|toward|to|Plan A|Plan B)|\blean\s+(yes|no)\b/i.test(directionalText)) {
      return "开放式单牌不得写成是/否答案";
    }
  }

  if (normalizeForComparison(reading.summary) === normalizeForComparison(reading.overallMessage)) {
    return "summary 和 overallMessage 不得重复";
  }

  if (expectedRequest && expectedRequest.questionScale && expectedRequest.questionScale.kind === "light_everyday_choice") {
    const lengthError = getLightEverydayLengthError(reading);

    if (lengthError) {
      return lengthError;
    }
  }

  return "";
}

function isOpenSingleCardRequest(expectedRequest) {
  return Boolean(
    expectedRequest &&
      expectedRequest.spread &&
      expectedRequest.spread.id === "oneCard" &&
      Array.isArray(expectedRequest.drawnCards) &&
      expectedRequest.drawnCards.length === 1 &&
      expectedRequest.answerGuidance &&
      expectedRequest.answerGuidance.kind === "reflective" &&
      expectedRequest.answerGuidance.shouldGivePreferredDirection === false
  );
}

function collectUserFacingReadingText(reading) {
  const fields = [
    {
      name: "summary",
      text: reading.summary
    },
    {
      name: "overallMessage",
      text: reading.overallMessage
    },
    {
      name: "practicalReflection",
      text: reading.practicalReflection
    },
    {
      name: "journalQuestion",
      text: reading.journalQuestion
    }
  ];

  if (Array.isArray(reading.cards)) {
    reading.cards.forEach((card, index) => {
      fields.push({
        name: `cards[${index}].interpretation`,
        text: card && card.interpretation
      });
    });
  }

  return fields.map((field) => ({
    name: field.name,
    text: String(field.text || "")
  }));
}

function getLightEverydayLengthError(reading) {
  const fields = collectUserFacingReadingText(reading);
  const limits = {
    summary: 90,
    overallMessage: 110,
    practicalReflection: 60
  };

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const cardMatch = field.name.match(/^cards\[(\d+)]\.interpretation$/);
    const limit = cardMatch ? 110 : limits[field.name];

    if (limit && field.text.length > limit) {
      return "低风险日常小选择的解读过长";
    }
  }

  return "";
}

function normalizeForComparison(value) {
  return String(value || "")
    .replace(/[，。！？、；：\s"'“”‘’]/g, "")
    .trim();
}

function readingJsonSchema() {
  return {
    type: "json_schema",
    name: "tarot_reading",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "schemaVersion",
        "sourceLabel",
        "summary",
        "cards",
        "overallMessage",
        "practicalReflection",
        "journalQuestion",
        "caveat"
      ],
      properties: {
        schemaVersion: {
          type: "string",
          enum: [READING_SCHEMA_VERSION]
        },
        sourceLabel: {
          type: "string"
        },
        summary: {
          type: "string"
        },
        cards: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "interpretation"],
            properties: {
              id: {
                type: "string"
              },
              interpretation: {
                type: "string"
              }
            }
          }
        },
        overallMessage: {
          type: "string"
        },
        practicalReflection: {
          type: "string"
        },
        journalQuestion: {
          type: "string"
        },
        caveat: {
          type: "string"
        }
      }
    }
  };
}

function textOr(value, fallback) {
  return typeof value === "string" && value.trim() ? value : fallback || "";
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function formatOrientation(orientation, language) {
  return formatOrientationText(orientation, language);
}

module.exports = {
  READING_SCHEMA_VERSION,
  assertValidReading,
  createAnswerGuidance,
  createLanguageRequest,
  createQuestionFocusRequest,
  createQuestionScaleRequest,
  createSpreadGuidance,
  createInvalidReadingError,
  createFallbackReading,
  createReadingRequest,
  isRetryableReadingFormatError,
  normalizeReading,
  readingDirectionPromptGuidance,
  readingJsonSchema
};
