const POLICY_CANONICAL_ORDER = Object.freeze([
  "shipping.md",
  "returns.md",
  "payments.md",
  "cancellation.md",
  "privacy.md",
  "support.md",
]);

const POLICY_TOPIC_ALIASES = Object.freeze({
  shipping: Object.freeze([
    "shipping",
    "delivery",
    "shipping fee",
    "shipping fees",
    "delivery fee",
    "delivery fees",
    "delivery charge",
    "delivery charges",
    "phí ship",
    "phí vận chuyển",
    "phí giao hàng",
    "vận chuyển",
    "giao hàng",
  ]),
  returns: Object.freeze([
    "return",
    "returns",
    "refund",
    "refunds",
    "exchange",
    "đổi trả",
    "trả sách",
    "hoàn tiền",
    "đổi sách",
  ]),
  payments: Object.freeze([
    "payment",
    "payments",
    "payment method",
    "payment methods",
    "payment card",
    "payment cards",
    "cards at checkout",
    "tax at checkout",
    "thanh toán",
    "phương thức thanh toán",
    "thẻ thanh toán",
    "thuế khi thanh toán",
  ]),
  cancellation: Object.freeze([
    "cancel order",
    "cancel my order",
    "cancellation",
    "cancel checkout",
    "hủy đơn",
    "huỷ đơn",
    "hủy đặt hàng",
    "huỷ đặt hàng",
    "hủy thanh toán",
    "huỷ thanh toán",
  ]),
  privacy: Object.freeze([
    "privacy",
    "privacy policy",
    "personal data",
    "data retention",
    "data deletion",
    "quyền riêng tư",
    "dữ liệu cá nhân",
    "xóa dữ liệu",
    "xoá dữ liệu",
  ]),
  support: Object.freeze([
    "contact support",
    "support response time",
    "support escalation",
    "customer support",
    "hỗ trợ",
    "liên hệ hỗ trợ",
    "chăm sóc khách hàng",
  ]),
});

const TOPIC_TO_SOURCE = Object.freeze({
  shipping: "shipping.md",
  returns: "returns.md",
  payments: "payments.md",
  cancellation: "cancellation.md",
  privacy: "privacy.md",
  support: "support.md",
});

const POLICY_SIGNAL_ALIASES = Object.freeze([
  "policy",
  "policies",
  "store policy",
  "chính sách",
  "chinh sach",
]);

function foldText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForMatching(message) {
  const normalized = String(message || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return { normalized, folded: foldText(normalized) };
}

function asAliasForms(alias) {
  const value = normalizeForMatching(alias);
  return [...new Set([value.normalized, value.folded].filter(Boolean))];
}

function containsPhrase(text, phrase) {
  if (!text || !phrase) return false;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "iu").test(text);
  } catch {
    return text.includes(phrase);
  }
}

function matchesAnyAlias(forms, aliases) {
  return aliases.some((alias) => asAliasForms(alias).some((form) => forms.some((text) => containsPhrase(text, form))));
}

function detectPolicyTopics(message) {
  const forms = Object.values(normalizeForMatching(message));
  return Object.keys(POLICY_TOPIC_ALIASES)
    .filter((topic) => matchesAnyAlias(forms, POLICY_TOPIC_ALIASES[topic]))
    .sort((left, right) => POLICY_CANONICAL_ORDER.indexOf(TOPIC_TO_SOURCE[left]) - POLICY_CANONICAL_ORDER.indexOf(TOPIC_TO_SOURCE[right]));
}

function hasPolicySignal(message, topics = detectPolicyTopics(message)) {
  if (topics.length) return true;
  const forms = Object.values(normalizeForMatching(message));
  return matchesAnyAlias(forms, POLICY_SIGNAL_ALIASES);
}

function isPreferredLanguage(value) {
  return value === "en" || value === "vi";
}

function parseLanguageCommand(message) {
  const forms = Object.values(normalizeForMatching(message));
  const vietnamese = ["vietnamese", "tiếng việt", "tieng viet", "vi" ];
  const english = ["english", "tiếng anh", "tieng anh", "en" ];
  const languageVerb = forms.some((text) => /(?:^|\s)(?:reply|answer|respond|write|speak)(?:\s|$)/i.test(text)
    && /(?:^|\s)(?:in|using)(?:\s|$)/i.test(text))
    || forms.some((text) => /(?:trả lời|tra loi|nói|noi|viết|viet)(?:\s|$)/i.test(text)
      && /(?:bằng|bang|tiếng|tieng)(?:\s|$)/i.test(text));
  if (!languageVerb) return undefined;
  if (vietnamese.some((alias) => forms.some((text) => containsPhrase(text, alias)))) return "vi";
  if (english.some((alias) => forms.some((text) => containsPhrase(text, alias)))) return "en";
  return undefined;
}

const VIETNAMESE_LANGUAGE_MARKERS = Object.freeze([
  "xin chao",
  "chao ban",
  "chinh sach",
  "van chuyen",
  "giao hang",
  "phi ship",
  "doi tra",
  "hoan tien",
  "thanh toan",
  "ho tro",
  "rieng tu",
  "toi",
  "ban",
  "hay",
  "cho toi",
  "sach",
  "du lieu",
  "lap trinh",
  "goi y",
  "thoi tiet",
  "hom nay",
  "mat khau",
  "bi mat",
  "cookie phien",
  "ma phien",
]);

function inferMessageLanguage(message) {
  const { normalized, folded } = normalizeForMatching(message);
  if ([...normalized.normalize("NFD")].some((character) => /[\u0300-\u036f]/u.test(character))) return "vi";
  if (VIETNAMESE_LANGUAGE_MARKERS.some((marker) => containsPhrase(folded, marker))) return "vi";
  return "en";
}

function resolveResponseLanguage({ message, preferredLanguage, explicitLanguage } = {}) {
  if (isPreferredLanguage(explicitLanguage)) return explicitLanguage;
  if (isPreferredLanguage(preferredLanguage)) return preferredLanguage;
  return inferMessageLanguage(message);
}

function languageDirective(language) {
  return language === "vi" ? "Respond in Vietnamese." : "Respond in English.";
}

module.exports = {
  POLICY_CANONICAL_ORDER,
  POLICY_TOPIC_ALIASES,
  TOPIC_TO_SOURCE,
  normalizeForMatching,
  detectPolicyTopics,
  hasPolicySignal,
  isPreferredLanguage,
  parseLanguageCommand,
  inferMessageLanguage,
  resolveResponseLanguage,
  languageDirective,
  containsPhrase,
};
