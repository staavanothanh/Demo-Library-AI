const { chunkMarkdown, hashContent } = require("../services/policyIndexer");

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
});
