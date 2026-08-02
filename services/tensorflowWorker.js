const { parentPort } = require("worker_threads");
const { loadBooks, recommend, embedTexts } = require("./tensorflowService");

const SAFE_ERROR_MESSAGES = {
  CATALOG_EMPTY: "The recommendation catalog is empty.",
  MODEL_LOAD_FAILED: "The recommendation model could not be loaded.",
  EMBEDDING_FAILED: "The embedding model could not process the request.",
  RECOMMENDATION_FAILED: "The recommendation model could not complete the request.",
};

function getWorkerErrorCode(error, type) {
  if (error?.code && SAFE_ERROR_MESSAGES[error.code]) return error.code;
  if (type === "loadBooks") return "MODEL_LOAD_FAILED";
  if (type === "embedTexts") return "EMBEDDING_FAILED";
  return "RECOMMENDATION_FAILED";
}

function toWorkerError(error, type) {
  const code = getWorkerErrorCode(error, type);
  return { code, error: SAFE_ERROR_MESSAGES[code] || "Recommendation worker failed." };
}

let queue = Promise.resolve();

if (parentPort) {
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
        parentPort.postMessage({ requestId, ...toWorkerError(error, type) });
      }
    });
  });
}

module.exports = { getWorkerErrorCode, toWorkerError };
