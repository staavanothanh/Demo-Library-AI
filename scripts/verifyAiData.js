const REQUIRED_EMBEDDING_DIMENSION = 512;

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
  const recommendation = recommendationClient?.getStatus?.() || {
    status: "unavailable",
    catalogCount: 0,
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
    `Recommendation error code: ${result.recommendation.lastErrorCode || "none"}`,
    `Atlas index: ${result.atlasIndex.status}`,
    `Atlas dimensions: ${result.atlasIndex.dimensions || "unknown"}`,
    `Atlas similarity: ${result.atlasIndex.similarity || "unknown"}`,
    `Atlas path: ${result.atlasIndex.path || "unknown"}`,
  ].join("\n");
}

async function main() {
  require("dotenv").config();
  const dns = require("node:dns");
  dns.setServers(["1.1.1.1", "1.0.0.1"]);

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
