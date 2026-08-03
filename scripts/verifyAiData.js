const REQUIRED_EMBEDDING_DIMENSION = 512;
const { configureRuntimeDns } = require("../services/runtimeDns");

function isValidEmbedding(embedding) {
  return Array.isArray(embedding)
    && embedding.length === REQUIRED_EMBEDDING_DIMENSION
    && embedding.every((value) => Number.isFinite(value));
}

async function inspectAtlasIndex({ KnowledgeChunk, indexName = "policy_chunks_vector" } = {}) {
  const listSearchIndexes = KnowledgeChunk?.collection?.listSearchIndexes;
  if (typeof listSearchIndexes !== "function") return { status: "unavailable", indexName };
  try {
    const cursor = listSearchIndexes.call(KnowledgeChunk.collection);
    const indexes = typeof cursor?.toArray === "function" ? await cursor.toArray() : await cursor;
    const index = (Array.isArray(indexes) ? indexes : []).find((item) => item?.name === indexName);
    if (!index) return { status: "missing", indexName };
    const fields = index.definition?.fields || index.latestDefinition?.fields || [];
    const vectorField = (Array.isArray(fields) ? fields : []).find((field) => field?.path === "embedding");
    const dimensions = Number(vectorField?.numDimensions || vectorField?.dimensions || 0) || undefined;
    const similarity = vectorField?.similarity;
    const path = vectorField?.path;
    const valid = index.type === "vectorSearch"
      && path === "embedding"
      && dimensions === REQUIRED_EMBEDDING_DIMENSION
      && similarity === "cosine";
    return { status: valid ? "ready" : "invalid", indexName, path, dimensions, similarity };
  } catch (error) {
    return { status: "unavailable", indexName };
  }
}

function summarizeEmbeddings(chunks) {
  const dimensions = [...new Set(chunks.map((chunk) => Array.isArray(chunk?.embedding) ? chunk.embedding.length : 0))]
    .filter((dimension) => dimension > 0)
    .sort((left, right) => left - right);
  const invalidEmbeddingCount = chunks.filter((chunk) => !isValidEmbedding(chunk?.embedding)).length;
  return { dimensions, invalidEmbeddingCount };
}

function isValidRecommendationId(value) {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
}

async function probeRecommendation({ Book, recommendationClient, prompt = "Node.js programming" } = {}) {
  const empty = {
    candidateCount: 0,
    validCandidateIdCount: 0,
    canonicalMatchCount: 0,
    endToEndReady: false,
  };
  if (typeof recommendationClient?.recommend !== "function") return empty;

  let recommendations;
  try {
    recommendations = await recommendationClient.recommend(prompt);
  } catch (error) {
    return { ...empty, errorCode: error?.code || "RECOMMENDATION_FAILED" };
  }

  const candidates = Array.isArray(recommendations?.books) ? recommendations.books : [];
  const validCandidateIds = candidates
    .map((candidate) => candidate?._id ?? candidate?.id)
    .filter(isValidRecommendationId);
  const lookupIds = [...new Set(validCandidateIds)];
  let canonicalMatchCount = 0;
  if (lookupIds.length && typeof Book?.find === "function") {
    try {
      const canonicalBooks = await Book.find({ _id: { $in: lookupIds } }).lean();
      canonicalMatchCount = Array.isArray(canonicalBooks) ? canonicalBooks.length : 0;
    } catch (error) {
      return {
        candidateCount: candidates.length,
        validCandidateIdCount: validCandidateIds.length,
        canonicalMatchCount: 0,
        endToEndReady: false,
        errorCode: error?.code || "CANONICAL_LOOKUP_FAILED",
      };
    }
  }

  return {
    candidateCount: candidates.length,
    validCandidateIdCount: validCandidateIds.length,
    canonicalMatchCount,
    endToEndReady: candidates.length > 0
      && validCandidateIds.length === candidates.length
      && canonicalMatchCount > 0,
  };
}

async function collectAiDataDiagnostics({ Book, KnowledgeChunk, recommendationClient, indexName = "policy_chunks_vector" } = {}) {
  const [books, policyChunks] = await Promise.all([
    Book.find({}).lean(),
    KnowledgeChunk.find({ category: "policy" }).lean(),
  ]);
  const safeBooks = Array.isArray(books) ? books : [];
  const safeChunks = Array.isArray(policyChunks) ? policyChunks : [];
  const embeddingSummary = summarizeEmbeddings(safeChunks);
  let recommendationErrorCode;
  try {
    await recommendationClient?.refreshBooks?.();
  } catch (error) {
    recommendationErrorCode = error?.code || "RECOMMENDATION_FAILED";
  }
  const recommendationStatus = recommendationClient?.getStatus?.() || {
    status: "unavailable",
    catalogCount: 0,
  };
  const recommendationProbe = recommendationErrorCode
    ? { candidateCount: 0, validCandidateIdCount: 0, canonicalMatchCount: 0, endToEndReady: false }
    : await probeRecommendation({ Book, recommendationClient });
  const recommendation = {
    ...recommendationStatus,
    ...recommendationProbe,
    ...((recommendationErrorCode || recommendationProbe.errorCode)
      ? { lastErrorCode: recommendationErrorCode || recommendationProbe.errorCode }
      : {}),
  };
  const atlasIndex = await inspectAtlasIndex({ KnowledgeChunk, indexName });
  const policyDataReady = safeChunks.length > 0 && embeddingSummary.invalidEmbeddingCount === 0;
  return {
    bookCount: safeBooks.length,
    knowledgeChunkCount: safeChunks.length,
    policyChunkCount: safeChunks.length,
    embeddingDimensions: embeddingSummary.dimensions,
    invalidEmbeddingCount: embeddingSummary.invalidEmbeddingCount,
    policyDataReady,
    policyVectorReady: policyDataReady && atlasIndex.status === "ready",
    recommendation: {
      ...recommendation,
      ...(recommendationErrorCode ? { lastErrorCode: recommendationErrorCode } : {}),
    },
    atlasIndex,
  };
}

function formatDiagnostics(result) {
  return [
    `Books: ${result.bookCount}`,
    `Knowledge chunks: ${result.knowledgeChunkCount}`,
    `Policy chunks: ${result.policyChunkCount}`,
    `Embedding dimensions: ${result.embeddingDimensions.join(", ") || "none"}`,
    `Invalid embeddings: ${result.invalidEmbeddingCount}`,
    `Policy data ready: ${result.policyDataReady ? "yes" : "no"}`,
    `Policy vector ready: ${result.policyVectorReady ? "yes" : "no"}`,
    `Recommendation status: ${result.recommendation.status || "unknown"}`,
    `Recommendation catalog count: ${Number(result.recommendation.catalogCount || 0)}`,
    `Recommendation candidate count: ${Number(result.recommendation.candidateCount || 0)}`,
    `Recommendation valid candidate IDs: ${Number(result.recommendation.validCandidateIdCount || 0)}`,
    `Recommendation canonical matches: ${Number(result.recommendation.canonicalMatchCount || 0)}`,
    `Recommendation end-to-end ready: ${result.recommendation.endToEndReady ? "yes" : "no"}`,
    `Recommendation error code: ${result.recommendation.lastErrorCode || "none"}`,
    `Atlas index: ${result.atlasIndex.status}`,
    `Atlas dimensions: ${result.atlasIndex.dimensions || "unknown"}`,
    `Atlas similarity: ${result.atlasIndex.similarity || "unknown"}`,
    `Atlas path: ${result.atlasIndex.path || "unknown"}`,
  ].join("\n");
}

async function main() {
  require("dotenv").config();
  configureRuntimeDns();

  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");
  const mongoose = require("mongoose");
  const Book = require("../models/Book");
  const KnowledgeChunk = require("../models/KnowledgeChunk");
  const { createRecommendationClient } = require("../services/recommendationClient");
  const recommendationClient = createRecommendationClient({ Book });
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const result = await collectAiDataDiagnostics({
      Book,
      KnowledgeChunk,
      recommendationClient,
      indexName: process.env.POLICY_VECTOR_INDEX_NAME || "policy_chunks_vector",
    });

    console.log(formatDiagnostics(result));
  } finally {
    await recommendationClient.stop();
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.code || "AI_VERIFY_FAILED");
    process.exitCode = 1;
  });
}

module.exports = {
  REQUIRED_EMBEDDING_DIMENSION,
  isValidEmbedding,
  inspectAtlasIndex,
  collectAiDataDiagnostics,
  formatDiagnostics,
};
