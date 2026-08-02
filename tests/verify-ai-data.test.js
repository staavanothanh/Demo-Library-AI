const {
  collectAiDataDiagnostics,
  formatDiagnostics,
  inspectAtlasIndex,
} = require("../scripts/verifyAiData");

describe("read-only AI data diagnostics", () => {
  it("reports counts, dimensions, readiness and Atlas index state without sensitive values", async () => {
    let catalogFilter;
    let policyFilter;
    const recommendationClient = {
      refreshBooks: async () => ({ response: "ready" }),
      getStatus: () => ({ status: "ready", catalogCount: 2, catalogVersion: 1 }),
      stop: async () => {},
    };
    const KnowledgeChunk = {
      find: (filter) => ({
        lean: async () => {
          policyFilter = filter;
          return [
            { category: "policy", source: "shipping.md", content: "Shipping", embedding: Array(512).fill(0) },
            { category: "policy", source: "bad.md", content: "Bad", embedding: [1, 2] },
          ];
        },
      }),
      collection: {
        listSearchIndexes: async () => [{ name: "policy_chunks_vector", type: "vectorSearch", definition: { fields: [{ path: "embedding", numDimensions: 512, similarity: "cosine", type: "vector" }] } }],
      },
    };
    const Book = { find: (filter) => { catalogFilter = filter; return { lean: async () => [{ _id: "book-1" }, { _id: "book-2" }] }; } };

    const result = await collectAiDataDiagnostics({ Book, KnowledgeChunk, recommendationClient });

    expect(result).toMatchObject({
      bookCount: 2,
      knowledgeChunkCount: 2,
      policyChunkCount: 2,
      invalidEmbeddingCount: 1,
      embeddingDimensions: [2, 512],
      recommendation: { status: "ready", catalogCount: 2 },
      policyDataReady: false,
      atlasIndex: { status: "ready", dimensions: 512, similarity: "cosine", path: "embedding" },
    });
    expect(catalogFilter).toEqual({});
    expect(policyFilter).toEqual({ category: "policy" });
    expect(formatDiagnostics(result)).not.toMatch(/MONGODB_URI|SESSION_SECRET|OPENCODE_ZEN_API_KEY|password|cookie/i);
  });

  it("marks missing Atlas indexes and recommendation failures without throwing", async () => {
    const result = await collectAiDataDiagnostics({
      Book: { find: () => ({ lean: async () => [] }) },
      KnowledgeChunk: {
        find: () => ({ lean: async () => [] }),
        collection: { listSearchIndexes: async () => [] },
      },
      recommendationClient: {
        refreshBooks: async () => { throw Object.assign(new Error("empty"), { code: "CATALOG_EMPTY" }); },
        getStatus: () => ({ status: "empty", catalogCount: 0, lastErrorCode: "CATALOG_EMPTY" }),
      },
    });

    expect(result).toMatchObject({
      bookCount: 0,
      policyDataReady: false,
      recommendation: { status: "empty", lastErrorCode: "CATALOG_EMPTY" },
      atlasIndex: { status: "missing" },
    });
  });

  it("validates the required Atlas index shape", async () => {
    const result = await inspectAtlasIndex({
      KnowledgeChunk: {
        collection: {
          listSearchIndexes: async () => [{ name: "policy_chunks_vector", type: "vectorSearch", definition: { fields: [{ path: "embedding", numDimensions: 128, similarity: "euclidean", type: "vector" }] } }],
        },
      },
      indexName: "policy_chunks_vector",
    });

    expect(result).toMatchObject({ status: "invalid", dimensions: 128, similarity: "euclidean" });
  });
});
