const {
  POLICY_CANONICAL_ORDER,
  TOPIC_TO_SOURCE,
  detectPolicyTopics,
  hasPolicySignal,
  normalizeForMatching,
} = require("./chatbotLexicon");

const DEFAULT_EMBEDDING_DIMENSION = 512;
const DEFAULT_THRESHOLD = 0.6;
const DEFAULT_LIMIT = 5;
const DEFAULT_OVERVIEW_LIMIT = 6;
const DEFAULT_TOPIC_LIMIT = 3;
const DEFAULT_VECTOR_RELATIVE_MARGIN = 0.08;

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
  const { normalized, folded } = normalizeForMatching(query);
  if (detectPolicyTopics(query).length) return false;
  return /(?:^|\s)(?:tell me about (?:the )?polic(?:y|ies)|what (?:are )?(?:your )?store polic(?:y|ies)|what polic(?:y|ies) do you have)(?:\s|$)/i.test(normalized)
    || /(?:^|\s)(?:hay cho toi biet chinh sach|cac chinh sach cua cua hang|cho toi biet chinh sach)(?:\s|$)/i.test(folded);
}

function resolvePolicyRoute(query) {
  const topics = detectPolicyTopics(query);
  if (topics.length) {
    return {
      mode: "topic",
      topics,
      sources: topics.map((topic) => TOPIC_TO_SOURCE[topic]).sort((left, right) => POLICY_CANONICAL_ORDER.indexOf(left) - POLICY_CANONICAL_ORDER.indexOf(right)),
    };
  }
  if (isPolicyOverviewQuery(query) || hasPolicySignal(query)) return { mode: "overview", topics: [], sources: [...POLICY_CANONICAL_ORDER] };
  return { mode: "unknown", topics: [], sources: [] };
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
  topicLimit = DEFAULT_TOPIC_LIMIT,
  vectorRelativeMargin = DEFAULT_VECTOR_RELATIVE_MARGIN,
  cacheTtlMs = 0,
} = {}) {
  const safeDimension = Number.isInteger(embeddingDimension) && embeddingDimension > 0
    ? embeddingDimension
    : DEFAULT_EMBEDDING_DIMENSION;
  const safeThreshold = Number.isFinite(Number(threshold)) ? clampScore(threshold) : DEFAULT_THRESHOLD;
  const safeOverviewLimit = Number.isInteger(overviewLimit) && overviewLimit > 0 ? overviewLimit : DEFAULT_OVERVIEW_LIMIT;
  const safeTopicLimit = Number.isInteger(topicLimit) && topicLimit > 0 ? topicLimit : DEFAULT_TOPIC_LIMIT;
  const safeVectorRelativeMargin = Number.isFinite(Number(vectorRelativeMargin)) && Number(vectorRelativeMargin) >= 0
    ? Number(vectorRelativeMargin)
    : DEFAULT_VECTOR_RELATIVE_MARGIN;
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

  const sourceRank = (source) => {
    const rank = POLICY_CANONICAL_ORDER.indexOf(source);
    return rank < 0 ? POLICY_CANONICAL_ORDER.length : rank;
  };

  const sortEvidence = (chunks) => [...chunks].sort((left, right) => {
    const sourceOrder = sourceRank(left.source) - sourceRank(right.source);
    if (sourceOrder !== 0) return sourceOrder;
    return Number(left.chunkIndex || 0) - Number(right.chunkIndex || 0);
  });

  const toResult = ({ chunks, mode, topics = [], fallback = true, overview = false }) => {
    const evidence = Array.isArray(chunks) ? chunks : [];
    const sources = [...new Set(evidence.map((chunk) => chunk?.source).filter((source) => typeof source === "string"))]
    return { chunks: evidence, sources, mode, topics, fallback, overview, refused: evidence.length === 0 };
  };

  const retrieveKnownRoute = async (route) => {
    const available = await loadChunks();
    if (route.mode === "overview") {
      const representatives = route.sources
        .map((source) => available.find((chunk) => chunk.source === source))
        .filter(Boolean)
        .slice(0, safeOverviewLimit);
      return toResult({ chunks: representatives, mode: "overview", overview: true });
    }

    const selected = route.sources.flatMap((source) => sortEvidence(available.filter((chunk) => chunk.source === source)).slice(0, safeTopicLimit));
    return toResult({ chunks: selected, mode: "topic", topics: route.topics });
  };

  const retrieve = async (query) => {
    const route = resolvePolicyRoute(query);
    if (route.mode === "topic" || route.mode === "overview") return retrieveKnownRoute(route);

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
        const ranked = (Array.isArray(vectorResults) ? vectorResults : [])
          .filter((chunk) => isValidPolicyChunk(chunk, safeDimension, false))
          .map((chunk) => ({ ...chunk, rawScore: Number(chunk.score), score: clampScore(chunk.score) }))
          .filter((chunk) => chunk.score >= safeThreshold)
          .sort((left, right) => right.score - left.score || sourceRank(left.source) - sourceRank(right.source) || Number(left.chunkIndex || 0) - Number(right.chunkIndex || 0));
        if (ranked.length) {
          const topScore = ranked[0].score;
          const chunks = ranked
            .filter((chunk, index) => index === 0 || topScore - chunk.score <= safeVectorRelativeMargin)
            .slice(0, DEFAULT_LIMIT);
          return toResult({ chunks, mode: "vector", fallback: false });
        }
      }
    } catch (error) {
      console.warn("Policy vector search unavailable; using memory fallback.");
    }

    const ranked = (await loadChunks())
      .map((chunk) => {
        const rawScore = cosineSimilarity(embedding, chunk.embedding);
        return { ...chunk, rawScore, score: normalizeCosineSimilarity(rawScore) };
      })
      .filter((chunk) => chunk.score >= safeThreshold)
      .sort((left, right) => right.score - left.score || sourceRank(left.source) - sourceRank(right.source) || Number(left.chunkIndex || 0) - Number(right.chunkIndex || 0));
    const topScore = ranked[0]?.score;
    const chunks = ranked
      .filter((chunk, index) => index === 0 || topScore - chunk.score <= safeVectorRelativeMargin)
      .slice(0, DEFAULT_LIMIT);
    return toResult({ chunks, mode: "memory" });
  };

  return {
    retrieve,
    invalidate,
    refresh: () => loadChunks(true),
    cosineSimilarity,
    normalizeCosineSimilarity,
    isPolicyOverviewQuery,
    resolvePolicyRoute,
  };
}

module.exports = {
  createPolicyService,
  createAtlasVectorSearch,
  cosineSimilarity,
  normalizeCosineSimilarity,
  isValidEmbedding,
  isPolicyOverviewQuery,
  resolvePolicyRoute,
};
