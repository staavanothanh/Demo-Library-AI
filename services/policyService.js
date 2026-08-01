function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || !left.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  return leftNorm && rightNorm ? dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)) : 0;
}

function createAtlasVectorSearch({
  KnowledgeChunk,
  indexName = process.env.POLICY_VECTOR_INDEX_NAME || "policy_chunks_vector",
  numCandidates = Number(process.env.POLICY_VECTOR_NUM_CANDIDATES || 50),
  limit = 5,
} = {}) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 5;
  const safeCandidates = Number.isInteger(numCandidates) && numCandidates >= safeLimit
    ? numCandidates
    : Math.max(safeLimit, 50);

  return async (queryVector) => {
    if (!Array.isArray(queryVector) || !queryVector.length) return [];
    if (!KnowledgeChunk || typeof KnowledgeChunk.aggregate !== "function") {
      throw new Error("KnowledgeChunk vector search is unavailable.");
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

function createPolicyService({ KnowledgeChunk, embeddingClient, threshold = 0.72, vectorSearch } = {}) {
  let cachedChunks;

  const loadChunks = async () => {
    if (!cachedChunks) cachedChunks = await KnowledgeChunk.find({}).lean();
    return cachedChunks;
  };

  const retrieve = async (query) => {
    const embedding = await embeddingClient.embed(query);
    try {
      if (vectorSearch) {
        const vectorResults = await vectorSearch(embedding);
        const chunks = (Array.isArray(vectorResults) ? vectorResults : [])
          .filter((chunk) => Number(chunk.score) >= threshold)
          .slice(0, 5);
        if (chunks.length) return { chunks, fallback: false, refused: false };
      }
    } catch (error) {
      console.warn(`Policy vector search unavailable; using memory fallback: ${error.message}`);
    }
    const chunks = (await loadChunks())
      .map((chunk) => ({ ...chunk, score: cosineSimilarity(embedding, chunk.embedding) }))
      .filter((chunk) => chunk.score >= threshold)
      .sort((left, right) => right.score - left.score)
      .slice(0, 5);
    return { chunks, fallback: true, refused: chunks.length === 0 };
  };

  return { retrieve, cosineSimilarity };
}

module.exports = { createPolicyService, createAtlasVectorSearch, cosineSimilarity };
