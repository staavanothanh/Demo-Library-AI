const { parentPort } = require("worker_threads");
const { loadBooks, recommend } = require("./tensorflowService");

let queue = Promise.resolve();

parentPort.on("message", (message) => {
  queue = queue.then(async () => {
    const { requestId, type, books, prompt } = message;
    try {
      const result = type === "loadBooks" ? await loadBooks(books || []) : await recommend(prompt);
      parentPort.postMessage({ requestId, ...result });
    } catch (error) {
      parentPort.postMessage({ requestId, error: error.message });
    }
  });
});
