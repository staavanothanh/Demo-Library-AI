const { createPolicyService } = require("../services/policyService");

function embedding() {
  return [1, 0];
}

function chunk(source, chunkIndex = 0, content = source) {
  return {
    category: "policy",
    source,
    chunkIndex,
    content,
    embedding: embedding(),
  };
}

describe("bilingual policy routing and evidence selection", () => {
  it.each([
    ["Chính sách vận chuyển của bạn là gì?", "shipping.md"],
    ["Chinh sach van chuyen cua ban la gi?", "shipping.md"],
    ["Phí giao hàng là bao nhiêu?", "shipping.md"],
    ["Can I return a book?", "returns.md"],
    ["Tôi có thể đổi trả sách không?", "returns.md"],
  ])("routes %s to one canonical source without embedding", async (query, source) => {
    let embeddingCalls = 0;
    const service = createPolicyService({
      KnowledgeChunk: {
        find: () => ({ lean: async () => [
          chunk("support.md"),
          chunk(source, 0, `${source} answer`),
          chunk("payments.md"),
        ] }),
      },
      embeddingClient: { embed: async () => { embeddingCalls += 1; throw new Error("known topic must not embed"); } },
      embeddingDimension: 2,
    });

    const result = await service.retrieve(query);

    expect(result.mode).toBe("topic");
    expect(result.sources).toEqual([source]);
    expect(result.chunks.map((item) => item.source)).toEqual([source]);
    expect(embeddingCalls).toBe(0);
  });

  it("selects explicit multi-topic evidence in canonical source order", async () => {
    const service = createPolicyService({
      KnowledgeChunk: {
        find: () => ({ lean: async () => [
          chunk("support.md"),
          chunk("shipping.md"),
          chunk("returns.md"),
          chunk("payments.md"),
        ] }),
      },
      embeddingClient: { embed: async () => { throw new Error("known topics must not embed"); } },
      embeddingDimension: 2,
    });

    const result = await service.retrieve("What is the return policy and shipping fee?");

    expect(result.mode).toBe("topic");
    expect(result.sources).toEqual(["shipping.md", "returns.md"]);
    expect(result.chunks.map((item) => item.source)).toEqual(["shipping.md", "returns.md"]);
  });

  it("keeps overview evidence bounded and in canonical order", async () => {
    const service = createPolicyService({
      KnowledgeChunk: {
        find: () => ({ lean: async () => [
          chunk("support.md"),
          chunk("privacy.md"),
          chunk("shipping.md"),
          chunk("returns.md"),
          chunk("payments.md"),
          chunk("cancellation.md"),
        ] }),
      },
      embeddingClient: { embed: async () => { throw new Error("overview must not embed"); } },
      embeddingDimension: 2,
    });

    const result = await service.retrieve("Hãy cho tôi biết chính sách của cửa hàng");

    expect(result.mode).toBe("overview");
    expect(result.sources).toEqual([
      "shipping.md",
      "returns.md",
      "payments.md",
      "cancellation.md",
      "privacy.md",
      "support.md",
    ]);
    expect(result.chunks).toHaveLength(6);
  });

  it("uses semantic fallback for unknown policy wording and limits relative results", async () => {
    let vectorCalls = 0;
    const service = createPolicyService({
      KnowledgeChunk: {
        find: () => ({ lean: async () => [chunk("shipping.md"), chunk("support.md")] }),
      },
      embeddingClient: { embed: async () => embedding() },
      vectorSearch: async () => {
        vectorCalls += 1;
        return [
          { ...chunk("support.md"), score: 0.91 },
          { ...chunk("shipping.md"), score: 0.90 },
          { ...chunk("privacy.md"), score: 0.2 },
        ];
      },
      threshold: 0.8,
      embeddingDimension: 2,
    });

    const result = await service.retrieve("where can I report a parcel issue");

    expect(vectorCalls).toBe(1);
    expect(result.mode).toBe("vector");
    expect(result.sources).toEqual(["support.md", "shipping.md"]);
    expect(result.chunks.every((item) => item.category === "policy")).toBe(true);
  });
});
