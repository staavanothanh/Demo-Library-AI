const { loadBooks, recommend, embedTexts } = require("../services/tensorflowService");

describe("TensorFlow retrieval boundary", () => {
  it("includes authors and genres in the semantic corpus and returns ids", async () => {
    await loadBooks([
      { _id: "book-1", title: "JavaScript", authors: "Author", genre: "Programming", description: "Async code" },
    ]);
    const result = await recommend("programming");

    expect(result.books[0]).toMatchObject({ _id: "book-1" });
    expect(result.books[0].score).toEqual(expect.any(Number));
  }, 30000);

  it("exposes query embedding for policy retrieval", async () => {
    const result = await embedTexts(["shipping policy"]);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
  }, 30000);
});
