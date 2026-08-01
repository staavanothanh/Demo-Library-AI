const { escapeRegex, parseCatalogQuery, buildCatalogFilter } = require("../controllers/catalogController");

describe("public catalog query handling", () => {
  it("escapes regex metacharacters before building a search filter", () => {
    const filter = buildCatalogFilter("node.js (guide)", "Programming");
    const pattern = filter.$or[0].title;

    expect(pattern).toBeInstanceOf(RegExp);
    expect(pattern.source).toBe(escapeRegex("node.js (guide)"));
    expect(pattern.flags).toContain("i");
    expect(filter.genre).toBe("Programming");
  });

  it("caps search input and normalizes bounded pagination", () => {
    const query = parseCatalogQuery({ page: "-2", limit: "999", q: "x".repeat(300), genre: " Programming ", sort: "price-desc" });

    expect(query).toEqual({ page: 1, limit: 48, q: "x".repeat(120), genre: "Programming", sort: "price-desc" });
  });

  it("uses safe defaults for malformed catalog parameters", () => {
    expect(parseCatalogQuery({ page: "abc", limit: "nope", sort: "unknown" })).toEqual({
      page: 1,
      limit: 12,
      q: "",
      genre: "",
      sort: "title",
    });
  });
});
