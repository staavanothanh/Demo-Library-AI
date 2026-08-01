const { chunkMarkdown, hashContent, indexPolicyDocuments, deleteStaleChunks } = require("../services/policyIndexer");

describe("policy indexing helpers", () => {
  it("splits markdown deterministically and preserves source boundaries", () => {
    const chunks = chunkMarkdown("# Shipping\n\nDemo shipping takes 3 days.\n\nContact support for help.", 30);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toContain("Shipping");
    expect(chunks[2]).toContain("Contact support");
  });

  it("returns a stable content hash", () => {
    expect(hashContent("same")).toBe(hashContent("same"));
    expect(hashContent("same")).not.toBe(hashContent("different"));
  });

  it("removes chunks for deleted sources and shrunken documents", async () => {
    const deletedQueries = [];
    const KnowledgeChunk = {
      updateOne: async () => undefined,
      deleteMany: async (query) => {
        deletedQueries.push(query);
        return { deletedCount: 1 };
      },
    };

    const result = await indexPolicyDocuments({
      files: [{ source: "shipping.md", title: "Shipping", content: "One paragraph." }],
      KnowledgeChunk,
      embeddingClient: { embed: async () => [1, 0] },
    });

    expect(result.deleted).toBe(2);
    expect(deletedQueries).toEqual([
      { category: "policy", source: { $nin: ["shipping.md"] } },
      { category: "policy", source: "shipping.md", chunkIndex: { $gte: 1 } },
    ]);
  });

  it("refuses empty policy sets instead of deleting all chunks", async () => {
    await expect(indexPolicyDocuments({
      files: [],
      KnowledgeChunk: { deleteMany: async () => ({ deletedCount: 99 }) },
      embeddingClient: { embed: async () => [1, 0] },
    })).rejects.toThrow("At least one policy document");
  });

  it("does not update a non-policy chunk when indexing", async () => {
    const updates = [];
    await indexPolicyDocuments({
      files: [{ source: "shipping.md", title: "Shipping", content: "One paragraph." }],
      KnowledgeChunk: {
        updateOne: async (filter) => updates.push(filter),
        deleteMany: async () => ({ deletedCount: 0 }),
      },
      embeddingClient: { embed: async () => [1, 0] },
    });

    expect(updates).toEqual([{ category: "policy", source: "shipping.md", chunkIndex: 0 }]);
  });

  it("refuses stale cleanup when there are no policy files", async () => {
    await expect(deleteStaleChunks({
      files: [],
      KnowledgeChunk: { deleteMany: async () => ({ deletedCount: 99 }) },
    })).rejects.toThrow("At least one policy document");
  });
});
