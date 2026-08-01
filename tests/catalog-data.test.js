const books = require("../data/books.json");

describe("seed bookstore catalog", () => {
  it("provides commerce fields for every seeded book", () => {
    expect(books).toHaveLength(80);
    for (const book of books) {
      expect(book.price).toEqual(expect.any(Number));
      expect(book.price).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(book.stock)).toBe(true);
      expect(book.stock).toBeGreaterThanOrEqual(0);
      expect(typeof book.coverUrl).toBe("string");
    }
  });
});
