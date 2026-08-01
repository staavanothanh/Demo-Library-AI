const path = require("path");
const { Worker } = require("worker_threads");

function createRecommendationClient({ Book }) {
  let worker;
  let sequence = 0;
  const pendingRequests = new Map();
  const ensureWorker = () => {
    if (worker) return worker;
    worker = new Worker(path.join(__dirname, "tensorflowWorker.js"));
    worker.on("message", (message) => {
      const pending = pendingRequests.get(message.requestId);
      if (!pending) return;
      pendingRequests.delete(message.requestId);
      message.error ? pending.reject(new Error(message.error)) : pending.resolve(message);
    });
    worker.on("error", (error) => {
      pendingRequests.forEach(({ reject }) => reject(error));
      pendingRequests.clear();
      worker = undefined;
    });
    return worker;
  };
  const send = (payload) => new Promise((resolve, reject) => {
    const requestId = String(++sequence);
    pendingRequests.set(requestId, { resolve, reject });
    ensureWorker().postMessage({ ...payload, requestId });
  });
  return {
    refreshBooks: async () => send({ type: "loadBooks", books: await Book.find({}).lean() }),
    recommend: async (prompt) => send({ type: "recommend", prompt }),
    embed: async (text) => {
      const result = await send({ type: "embedTexts", texts: [text] });
      return result.embeddings[0] || [];
    },
    embedMany: async (texts) => {
      const result = await send({ type: "embedTexts", texts });
      return result.embeddings || [];
    },
    stop: async () => worker?.terminate(),
  };
}

module.exports = { createRecommendationClient };
