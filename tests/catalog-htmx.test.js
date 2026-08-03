const { createCatalogController } = require("../controllers/catalogController");

function queryResult(value) {
  const query = {
    sort: () => query,
    skip: () => query,
    limit: () => query,
    lean: async () => value,
  };
  return query;
}

function response() {
  const result = { renders: [], varies: [] };
  result.vary = (value) => { result.varies.push(value); return result; };
  result.render = (view, data) => { result.renders.push({ view, data }); return result.renders.at(-1); };
  return result;
}

describe("catalog HTMX response contract", () => {
  it("renders the full canonical page for a normal request", async () => {
    const Book = {
      countDocuments: async () => 1,
      find: () => queryResult([{ _id: "book-1", title: "A Book" }]),
    };
    const controller = createCatalogController({ Book });
    const res = response();

    await controller.listBooks({ query: { q: "A Book", page: "1" }, get: () => undefined }, res, (error) => { throw error; });

    expect(res.renders[0].view).toBe("booklist");
    expect(res.renders[0].data.books).toHaveLength(1);
    expect(res.varies).toContain("HX-Request");
  });

  it("renders only the shared catalog-results fragment for an exact HTMX request", async () => {
    const Book = {
      countDocuments: async () => 1,
      find: () => queryResult([{ _id: "book-1", title: "A Book" }]),
    };
    const controller = createCatalogController({ Book });
    const res = response();

    await controller.listBooks({ query: { q: "A Book", sort: "rating", page: "2" }, get: (name) => name === "HX-Request" ? "true" : undefined }, res, (error) => { throw error; });

    expect(res.renders[0].view).toBe("partials/catalog-results");
    expect(res.renders[0].data.filters.sort).toBe("rating");
    expect(res.renders[0].data.query).toBe("A Book");
    expect(res.varies).toContain("HX-Request");
  });

  it("keeps pagination bounded and uses the canonical query for both modes", async () => {
    let received;
    const Book = {
      countDocuments: async () => 100,
      find: () => {
        received = queryResult([]);
        return received;
      },
    };
    const controller = createCatalogController({ Book });
    const res = response();

    await controller.listBooks({ query: { q: "<script>", limit: "48", page: "999" }, get: () => "true" }, res, (error) => { throw error; });

    expect(res.renders[0].data.currentPage).toBeLessThanOrEqual(res.renders[0].data.totalPages);
    expect(res.renders[0].data.query).toBe("<script>");
    expect(received).toBeDefined();
  });
});
