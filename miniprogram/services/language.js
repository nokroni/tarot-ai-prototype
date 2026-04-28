const DEFAULT_LANGUAGE_CODE = "zh";

const languageConfigs = {
  zh: {
    code: "zh",
    label: "中文",
    shortLabel: "中",
    outputLanguage: "自然简体中文",
    safetyCaveat: "AI生成内容，仅供娱乐和自我反思",
    fullCaveat: "AI生成内容，仅供娱乐和自我反思，不构成专业建议或确定预言。",
    professionalCaveat: "涉及医疗、法律、财务或紧急问题时，请咨询合格专业人士。",
    orientation: {
      upright: "正位",
      reversed: "逆位"
    },
    keywordJoiner: "、"
  },
  en: {
    code: "en",
    label: "English",
    shortLabel: "EN",
    outputLanguage: "natural English",
    safetyCaveat: "AI-generated content, for entertainment and self-reflection only",
    fullCaveat: "AI-generated content, for entertainment and self-reflection only. It is not professional advice or a certain prediction.",
    professionalCaveat: "For medical, legal, financial, or emergency matters, please consult a qualified professional.",
    orientation: {
      upright: "Upright",
      reversed: "Reversed"
    },
    keywordJoiner: ", "
  }
};

const languageOptions = Object.keys(languageConfigs).map((code) => ({
  id: code,
  label: languageConfigs[code].shortLabel,
  title: languageConfigs[code].label
}));

function normalizeLanguageCode(language) {
  const code = typeof language === "string"
    ? language
    : language && language.code;

  return code === "en" ? "en" : DEFAULT_LANGUAGE_CODE;
}

function getLanguageConfig(language) {
  return languageConfigs[normalizeLanguageCode(language)];
}

function createLanguageRequest(language) {
  const config = getLanguageConfig(language);

  return {
    code: config.code,
    label: config.label,
    outputLanguage: config.outputLanguage,
    safetyCaveat: config.safetyCaveat,
    orientationText: {
      upright: config.orientation.upright,
      reversed: config.orientation.reversed
    }
  };
}

function formatOrientationText(orientation, language) {
  const config = getLanguageConfig(language);

  return orientation === "reversed" ? config.orientation.reversed : config.orientation.upright;
}

module.exports = {
  DEFAULT_LANGUAGE_CODE,
  createLanguageRequest,
  formatOrientationText,
  getLanguageConfig,
  languageOptions,
  normalizeLanguageCode
};
