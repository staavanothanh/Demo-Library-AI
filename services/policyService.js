const DEFAULT_EMBEDDING_DIMENSION = 512;
const DEFAULT_THRESHOLD = 0.6;
const DEFAULT_LIMIT = 5;
const DEFAULT_OVERVIEW_LIMIT = 8;

function createPolicyError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function clampScore(score) {
  if (!Number.isFinite(Number(score))) return 0;
  return Math.min(1, Math.max(0, Number(score)));
}

function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || !left.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (!Number.isFinite(left[index]) || !Number.isFinite(right[index])) return 0;
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  return leftNorm && rightNorm ? dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)) : 0;
}

function normalizeCosineSimilarity(rawScore) {
  return clampScore((Number(rawScore) + 1) / 2);
}

function isValidEmbedding(embedding, dimension = DEFAULT_EMBEDDING_DIMENSION) {
  return Array.isArray(embedding)
    && embedding.length === dimension
    && embedding.every((value) => Number.isFinite(value));
}

function isPolicyOverviewQuery(query) {
  return /tell me about (?:the )?polic(?:y|ies)|what (?:are )?(?:your )?store polic(?:y|ies)|what polic(?:y|ies) do you have|hãy cho tôi biết chính sách|các chính sách của cửa hàng là gì/i.test(String(query || "").trim());
}

function isValidPolicyChunk(chunk, dimension, requireEmbedding = true) {
  if (!chunk || chunk.category !== "policy" || typeof chunk.content !== "string" || !chunk.content.trim()) return false;
  return !requireEmbedding || isValidEmbedding(chunk.embedding, dimension);
}

function createAtlasVectorSearch({
  KnowledgeChunk,
  indexName = process.env.POLICY_VECTOR_INDEX_NAME || "policy_chunks_vector",
  numCandidates = Number(process.env.POLICY_VECTOR_NUM_CANDIDATES || 50),
  limit = DEFAULT_LIMIT,
} = {}) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIMIT;
  const safeCandidates = Number.isInteger(numCandidates) && numCandidates >= safeLimit
    ? numCandidates
    : Math.max(safeLimit, 50);

  return async (queryVector) => {
    if (!Array.isArray(queryVector) || !queryVector.length) return [];
    if (!KnowledgeChunk || typeof KnowledgeChunk.aggregate !== "function") {
      throw createPolicyError("POLICY_VECTOR_UNAVAILABLE", "KnowledgeChunk vector search is unavailable.");
    }

    const query = KnowledgeChunk.aggregate([
      {
        $vectorSearch: {
          index: String(indexName),
          path: "embedding",
          queryVector,
          numCandidates: safeCandidates,
          limit: safeLimit,
        },
      },
      { $match: { category: "policy" } },
      {
        $project: {
          _id: 1,
          source: 1,
          category: 1,
          title: 1,
          content: 1,
          chunkIndex: 1,
          contentHash: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ]);
    return typeof query.exec === "function" ? query.exec() : query;
  };
}

function createPolicyService({
  KnowledgeChunk,
  embeddingClient,
  threshold = DEFAULT_THRESHOLD,
  vectorSearch,
  embeddingDimension = DEFAULT_EMBEDDING_DIMENSION,
  overviewLimit = DEFAULT_OVERVIEW_LIMIT,
  cacheTtlMs = 0,
} = {}) {
  const safeDimension = Number.isInteger(embeddingDimension) && embeddingDimension > 0
    ? embeddingDimension
    : DEFAULT_EMBEDDING_DIMENSION;
  const safeThreshold = Number.isFinite(Number(threshold)) ? clampScore(threshold) : DEFAULT_THRESHOLD;
  const safeOverviewLimit = Number.isInteger(overviewLimit) && overviewLimit > 0 ? overviewLimit : DEFAULT_OVERVIEW_LIMIT;
  const safeCacheTtlMs = Number.isFinite(Number(cacheTtlMs)) && Number(cacheTtlMs) > 0 ? Number(cacheTtlMs) : 0;
  let cachedChunks;
  let cachedAt = 0;

  const loadChunks = async (force = false) => {
    const cacheFresh = cachedChunks?.length
      && (!safeCacheTtlMs || Date.now() - cachedAt < safeCacheTtlMs);
    if (!force && cacheFresh) return cachedChunks;
    if (!KnowledgeChunk || typeof KnowledgeChunk.find !== "function") return [];
    const rawChunks = await KnowledgeChunk.find({ category: "policy" }).lean();
    const chunks = (Array.isArray(rawChunks) ? rawChunks : [])
      .filter((chunk) => isValidPolicyChunk(chunk, safeDimension));
    if (chunks.length) {
      cachedChunks = chunks;
      cachedAt = Date.now();
    } else {
      cachedChunks = undefined;
      cachedAt = 0;
    }
    return chunks;
  };

  const invalidate = () => {
    cachedChunks = undefined;
    cachedAt = 0;
  };

  const retrieveOverview = async () => {
    const chunks = (await loadChunks()).slice(0, safeOverviewLimit);
    return { chunks, fallback: true, overview: true, refused: chunks.length === 0 };
  };

  const retrieve = async (query) => {
    if (isPolicyOverviewQuery(query)) return retrieveOverview();

    let embedding;
    try {
      embedding = await embeddingClient.embed(query);
    } catch (error) {
      throw error?.code ? error : createPolicyError("EMBEDDING_FAILED", "Policy query embedding failed.");
    }
    if (!isValidEmbedding(embedding, safeDimension)) {
      throw createPolicyError("EMBEDDING_INVALID", `Policy query embedding must contain ${safeDimension} finite values.`);
    }

    try {
      if (vectorSearch) {
        const vectorResults = await vectorSearch(embedding);
        const chunks = (Array.isArray(vectorResults) ? vectorResults : [])
          .filter((chunk) => isValidPolicyChunk(chunk, safeDimension, false))
          .map((chunk) => ({ ...chunk, rawScore: Number(chunk.score), score: clampScore(chunk.score) }))
          .filter((chunk) => chunk.score >= safeThreshold)
          .slice(0, DEFAULT_LIMIT);
        if (chunks.length) return { chunks, fallback: false, overview: false, refused: false };
      }
    } catch (error) {
      console.warn("Policy vector search unavailable; using memory fallback.");
    }

    const chunks = (await loadChunks())
      .map((chunk) => {
        const rawScore = cosineSimilarity(embedding, chunk.embedding);
        return { ...chunk, rawScore, score: normalizeCosineSimilarity(rawScore) };
      })
      .filter((chunk) => chunk.score >= safeThreshold)
      .sort((left, right) => right.score - left.score)
      .slice(0, DEFAULT_LIMIT);
    return { chunks, fallback: true, overview: false, refused: chunks.length === 0 };
  };

  return {
    retrieve,
    invalidate,
    refresh: () => loadChunks(true),
    cosineSimilarity,
    normalizeCosineSimilarity,
    isPolicyOverviewQuery,
  };
}

module.exports = {
  createPolicyService,
  createAtlasVectorSearch,
  cosineSimilarity,
  normalizeCosineSimilarity,
  isValidEmbedding,
  isPolicyOverviewQuery,
};
