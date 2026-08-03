const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_ITEMS = 4;
const { isPreferredLanguage, sanitizeGeneration } = require("../services/chatbotService");

const SAFE_INTENT = new Set(["policy", "recommendation", "mixed", "conversation", "book-information", "out-of-scope"]);
const SAFE_STAGE = new Set(["classify", "policy-retrieve", "provider", "recommend", "canonical-lookup", "database", "runtime"]);
const SAFE_CODE = /^[A-Z][A-Z0-9_]{1,63}$/;

function createChatbotController({ chatbotService }) {
  return {
    chat: async (req, res, next) => {
      const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
      if (!message || message.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ error: "Message must contain 1–2000 characters." });
      try {
        const history = Array.isArray(req.session.chatHistory) ? req.session.chatHistory.slice(-MAX_HISTORY_ITEMS) : [];
        const preferredLanguage = isPreferredLanguage(req.session.chatPreferredLanguage) ? req.session.chatPreferredLanguage : undefined;
        if (req.session.chatPreferredLanguage !== undefined && !preferredLanguage) delete req.session.chatPreferredLanguage;
        const result = await chatbotService.chat({ message, history, preferredLanguage });
        if (isPreferredLanguage(result?.preferredLanguage)) req.session.chatPreferredLanguage = result.preferredLanguage;
        req.session.chatHistory = [...history, { role: "user", content: message }, { role: "assistant", content: result.answer }].slice(-MAX_HISTORY_ITEMS);
        const response = { answer: result.answer, intent: result.intent, sources: result.sources || [], books: result.books || [] };
        const generation = sanitizeGeneration(result?.generation);
        if (generation) response.generation = generation;
        return res.json(response);
      } catch (error) {
        const safeLog = {
          event: "chatbot_request_failed",
          intent: SAFE_INTENT.has(error?.intent) ? error.intent : "unknown",
          stage: SAFE_STAGE.has(error?.stage) ? error.stage : "unknown",
          code: SAFE_CODE.test(error?.code || "") ? error.code : "INTERNAL",
        };
        if (Number.isSafeInteger(error?.candidateCount) && error.candidateCount >= 0) safeLog.candidateCount = error.candidateCount;
        if (Number.isSafeInteger(error?.canonicalCount) && error.canonicalCount >= 0) safeLog.canonicalCount = error.canonicalCount;
        if (error?.responseLanguage === "en" || error?.responseLanguage === "vi") safeLog.responseLanguage = error.responseLanguage;
        console.error(JSON.stringify(safeLog));
        const statusByCode = {
          NOT_CONFIGURED: 503,
          UPSTREAM_UNAVAILABLE: 503,
          TIMEOUT: 504,
          RATE_LIMITED: 429,
          AUTH_FAILED: 502,
          INVALID_RESPONSE: 502,
          TRUNCATED_RESPONSE: 502,
          UPSTREAM_ERROR: 502,
          CATALOG_EMPTY: 503,
          CATALOG_INVALID: 503,
          MODEL_LOAD_FAILED: 503,
          EMBEDDING_FAILED: 503,
          EMBEDDING_INVALID: 503,
          RECOMMENDATION_FAILED: 503,
        };
        const messageByCode = {
          CATALOG_EMPTY: "Book recommendations are unavailable because the catalog is empty.",
          CATALOG_INVALID: "Book recommendations are temporarily unavailable because the catalog is invalid.",
          MODEL_LOAD_FAILED: "Book recommendations are temporarily unavailable while the AI model loads.",
          EMBEDDING_FAILED: "The bookstore assistant could not process that request right now.",
          EMBEDDING_INVALID: "The bookstore assistant could not process that request right now.",
          RECOMMENDATION_FAILED: "Book recommendations are temporarily unavailable.",
        };
        const messageByCodeVi = {
          CATALOG_EMPTY: "Không thể gợi ý sách vì danh mục đang trống.",
          CATALOG_INVALID: "Không thể gợi ý sách vì danh mục không hợp lệ.",
          MODEL_LOAD_FAILED: "Không thể gợi ý sách trong lúc mô hình AI đang tải.",
          EMBEDDING_FAILED: "Chatbot không thể xử lý yêu cầu lúc này.",
          EMBEDDING_INVALID: "Chatbot không thể xử lý yêu cầu lúc này.",
          RECOMMENDATION_FAILED: "Tạm thời không thể gợi ý sách.",
          TRUNCATED_RESPONSE: "Nhà cung cấp chatbot trả về phản hồi chưa hoàn chỉnh.",
        };
        const defaultError = error?.responseLanguage === "vi"
          ? "Trợ lý cửa hàng hiện tạm thời không thể xử lý yêu cầu."
          : "The bookstore assistant is temporarily unavailable.";
        return res.status(statusByCode[error.code] || 500).json({
          error: (error?.responseLanguage === "vi" ? messageByCodeVi[error.code] : messageByCode[error.code]) || defaultError,
        });
      }
    },
  };
}

module.exports = { createChatbotController, MAX_MESSAGE_LENGTH, MAX_HISTORY_ITEMS };
