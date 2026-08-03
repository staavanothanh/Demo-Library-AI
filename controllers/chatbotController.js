const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_ITEMS = 4;

function createChatbotController({ chatbotService }) {
  return {
    chat: async (req, res, next) => {
      const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
      if (!message || message.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ error: "Message must contain 1–2000 characters." });
      try {
        const history = Array.isArray(req.session.chatHistory) ? req.session.chatHistory.slice(-MAX_HISTORY_ITEMS) : [];
        const result = await chatbotService.chat({ message, history });
        req.session.chatHistory = [...history, { role: "user", content: message }, { role: "assistant", content: result.answer }].slice(-MAX_HISTORY_ITEMS);
        return res.json({ answer: result.answer, intent: result.intent, sources: result.sources || [], books: result.books || [] });
      } catch (error) {
        const safeLog = {
          event: "chatbot_request_failed",
          intent: typeof error?.intent === "string" ? error.intent : "unknown",
          stage: typeof error?.stage === "string" ? error.stage : "unknown",
          code: typeof error?.code === "string" ? error.code : "INTERNAL",
        };
        if (Number.isSafeInteger(error?.candidateCount)) safeLog.candidateCount = error.candidateCount;
        if (Number.isSafeInteger(error?.canonicalCount)) safeLog.canonicalCount = error.canonicalCount;
        console.error(JSON.stringify(safeLog));
        const statusByCode = {
          NOT_CONFIGURED: 503,
          UPSTREAM_UNAVAILABLE: 503,
          TIMEOUT: 504,
          RATE_LIMITED: 429,
          AUTH_FAILED: 502,
          INVALID_RESPONSE: 502,
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
        return res.status(statusByCode[error.code] || 500).json({
          error: messageByCode[error.code] || "The bookstore assistant is temporarily unavailable.",
        });
      }
    },
  };
}

module.exports = { createChatbotController, MAX_MESSAGE_LENGTH, MAX_HISTORY_ITEMS };
