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
        console.error(`Chatbot request failed: ${error.code || "INTERNAL"}`);
        return res.status(error.code === "NOT_CONFIGURED" || error.code === "UPSTREAM_UNAVAILABLE" ? 503 : 500).json({ error: "The bookstore assistant is temporarily unavailable." });
      }
    },
  };
}

module.exports = { createChatbotController, MAX_MESSAGE_LENGTH, MAX_HISTORY_ITEMS };
