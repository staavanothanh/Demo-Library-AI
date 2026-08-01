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
        const chunks = vectorResults.filter((chunk) => Number(chunk.score) >= threshold);
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

module.exports = { createPolicyService, cosineSimilarity };
