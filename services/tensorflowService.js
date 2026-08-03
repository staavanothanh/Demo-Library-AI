const tf = require("@tensorflow/tfjs");
const use = require("@tensorflow-models/universal-sentence-encoder");

const EMBEDDING_DIMENSION = 512;

let model;
let cachedBooks = [];
let cachedEmbeddings;
let readiness = {
  status: "loading",
  catalogCount: 0,
  embeddingDimension: EMBEDDING_DIMENSION,
  lastErrorCode: undefined,
};

function createAiError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function setReadiness(status, details = {}) {
  readiness = {
    ...readiness,
    status,
    ...details,
  };
}

function isValidEmbeddingRow(row) {
  return Array.isArray(row)
    && row.length === EMBEDDING_DIMENSION
    && row.every((value) => Number.isFinite(value));
}

function isValidEmbeddingMatrix(values, expectedRows) {
  return Array.isArray(values)
    && values.length === expectedRows
    && values.every(isValidEmbeddingRow);
}

async function loadModel() {
  if (model) return model;
  try {
    model = await use.load();
    return model;
  } catch (error) {
    setReadiness("failed", { lastErrorCode: "MODEL_LOAD_FAILED" });
    throw createAiError("MODEL_LOAD_FAILED", "The recommendation model could not be loaded.");
  }
}

async function embedWithModel(encoder, texts) {
  let embeddings;
  try {
    embeddings = await encoder.embed(texts);
    const values = await embeddings.array();
    if (!isValidEmbeddingMatrix(values, texts.length)) {
      throw createAiError("EMBEDDING_FAILED", `Embeddings must contain ${EMBEDDING_DIMENSION} finite values per text.`);
    }
    return { embeddings, values };
  } catch (error) {
    embeddings?.dispose();
    if (error?.code) throw error;
    throw createAiError("EMBEDDING_FAILED", "The embedding model returned invalid data.");
  }
}

async function embedTexts(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const encoder = await loadModel();
  let result;
  try {
    result = await embedWithModel(encoder, texts);
  } catch (error) {
    setReadiness("failed", { lastErrorCode: error.code || "EMBEDDING_FAILED" });
    throw error;
  }
  result.embeddings.dispose();
  return result.values;
}

async function loadBooks(books) {
  if (!Array.isArray(books) || books.length === 0) {
    cachedEmbeddings?.dispose();
    cachedBooks = [];
    cachedEmbeddings = undefined;
    setReadiness("empty", { catalogCount: 0, lastErrorCode: "CATALOG_EMPTY" });
    throw createAiError("CATALOG_EMPTY", "The recommendation catalog is empty.");
  }

  if (books.some((book) => typeof book?._id !== "string" || !book._id.trim())) {
    cachedEmbeddings?.dispose();
    cachedBooks = [];
    cachedEmbeddings = undefined;
    setReadiness("failed", { catalogCount: 0, lastErrorCode: "CATALOG_INVALID" });
    throw createAiError("CATALOG_INVALID", "The recommendation catalog contains invalid book identifiers.");
  }

  const encoder = await loadModel();
  const nextBooks = books.map((book) => ({ ...book, _id: book._id.trim() }));
  const texts = nextBooks.map((book) => `${book.title || ""}. ${book.authors || ""}. ${book.genre || ""}. ${book.description || ""}`.trim());
  let result;
  try {
    result = await embedWithModel(encoder, texts);
  } catch (error) {
    setReadiness("failed", { catalogCount: 0, lastErrorCode: error.code || "EMBEDDING_FAILED" });
    throw error;
  }

  const previousEmbeddings = cachedEmbeddings;
  cachedBooks = nextBooks;
  cachedEmbeddings = result.embeddings;
  previousEmbeddings?.dispose();
  setReadiness("ready", { catalogCount: cachedBooks.length, catalogVersion: (readiness.catalogVersion || 0) + 1, lastErrorCode: undefined });
  return { response: `AI index is ready for ${cachedBooks.length} books.`, books: [] };
}

async function recommend(prompt) {
  if (!cachedEmbeddings || !cachedBooks.length) {
    setReadiness("empty", { catalogCount: 0, lastErrorCode: "CATALOG_EMPTY" });
    throw createAiError("CATALOG_EMPTY", "The recommendation catalog is empty.");
  }

  const encoder = await loadModel();
  let queryEmbedding;
  try {
    queryEmbedding = await encoder.embed([prompt]);
    const values = await queryEmbedding.array();
    if (!isValidEmbeddingMatrix(values, 1)) {
      throw createAiError("EMBEDDING_FAILED", `Embeddings must contain ${EMBEDDING_DIMENSION} finite values per text.`);
    }
    const scores = tf.tidy(() => {
      const queryNorm = queryEmbedding.norm(2, 1, true);
      const bookNorms = cachedEmbeddings.norm(2, 1, true);
      return cachedEmbeddings.matMul(queryEmbedding.transpose()).div(bookNorms.mul(queryNorm)).squeeze().arraySync();
    });
    const scoreList = Array.isArray(scores) ? scores : [scores];
    if (!scoreList.every((score) => Number.isFinite(score))) {
      throw createAiError("RECOMMENDATION_FAILED", "The recommendation model returned invalid scores.");
    }
    const books = cachedBooks
      .map((book, index) => ({ _id: String(book._id), title: book.title, authors: book.authors, genre: book.genre, score: Number(scoreList[index].toFixed(3)) }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 5);
    return { response: books.length ? "Here are books that best match your request." : "No matching books were found.", books };
  } catch (error) {
    setReadiness(error.code === "CATALOG_EMPTY" ? "empty" : "failed", { lastErrorCode: error.code || "RECOMMENDATION_FAILED" });
    if (error?.code) throw error;
    throw createAiError("RECOMMENDATION_FAILED", "The recommendation model could not complete the request.");
  } finally {
    queryEmbedding?.dispose();
  }
}

function getStatus() {
  return { ...readiness };
}

function resetForTests() {
  cachedEmbeddings?.dispose();
  model = undefined;
  cachedBooks = [];
  cachedEmbeddings = undefined;
  readiness = {
    status: "loading",
    catalogCount: 0,
    embeddingDimension: EMBEDDING_DIMENSION,
    lastErrorCode: undefined,
  };
}

module.exports = {
  EMBEDDING_DIMENSION,
  loadModel,
  loadBooks,
  recommend,
  embedTexts,
  getStatus,
  resetForTests,
};
