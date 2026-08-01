const { parentPort } = require("worker_threads");
const { loadBooks, recommend, embedTexts } = require("./tensorflowService");

let queue = Promise.resolve();

parentPort.on("message", (message) => {
  queue = queue.then(async () => {
    const { requestId, type, books, prompt, texts } = message;
    try {
      const result = type === "loadBooks"
        ? await loadBooks(books || [])
        : type === "embedTexts"
          ? { embeddings: await embedTexts(texts || []) }
          : await recommend(prompt);
      parentPort.postMessage({ requestId, ...result });
    } catch (error) {
      parentPort.postMessage({ requestId, error: error.message });
    }
  });
});
