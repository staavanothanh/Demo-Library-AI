const tf = require("@tensorflow/tfjs");

const use = require("@tensorflow-models/universal-sentence-encoder");
const loadMock = vi.spyOn(use, "load");
const {
  loadBooks,
  recommend,
  embedTexts,
  resetForTests,
} = require("../services/tensorflowService");
const { toWorkerError } = require("../services/tensorflowWorker");

function embeddingFor(text) {
  const vector = Array(512).fill(0);
  vector[0] = String(text).includes("programming") ? 1 : 0.5;
  vector[1] = String(text).includes("shipping") ? 1 : 0;
  return vector;
}

beforeEach(() => {
  resetForTests();
  loadMock.mockReset();
  loadMock.mockResolvedValue({
    embed: async (texts) => tf.tensor2d(texts.map(embeddingFor), [texts.length, 512]),
  });
});

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
    expect(result[0]).toHaveLength(512);
  }, 30000);

  it("returns no embeddings for an empty input without loading the model", async () => {
    await expect(embedTexts([])).resolves.toEqual([]);
    expect(loadMock).not.toHaveBeenCalled();
  });

  it("rejects an empty catalog with CATALOG_EMPTY", async () => {
    await expect(loadBooks([])).rejects.toMatchObject({ code: "CATALOG_EMPTY" });
  });

  it("rejects non-string worker catalog identifiers with CATALOG_INVALID", async () => {
    await expect(loadBooks([{ _id: { buffer: new Uint8Array(12) }, title: "JavaScript" }]))
      .rejects.toMatchObject({ code: "CATALOG_INVALID" });
  });

  it("reports model loading failures with MODEL_LOAD_FAILED", async () => {
    loadMock.mockRejectedValueOnce(new Error("model unavailable"));

    await expect(loadBooks([{ _id: "book-1", title: "JavaScript" }])).rejects.toMatchObject({ code: "MODEL_LOAD_FAILED" });
  });

  it("reports non-finite or wrong-dimension embeddings as EMBEDDING_FAILED", async () => {
    loadMock.mockResolvedValueOnce({
      embed: async () => tf.tensor2d([[1, Number.NaN]], [1, 2]),
    });

    await expect(loadBooks([{ _id: "book-1", title: "JavaScript" }])).rejects.toMatchObject({ code: "EMBEDDING_FAILED" });
  });

  it("uses the same bounded bilingual concept suffix for catalog and query retrieval", async () => {
    const captured = [];
    loadMock.mockResolvedValueOnce({
      embed: async (texts) => {
        captured.push(...texts);
        return tf.tensor2d(texts.map(embeddingFor), [texts.length, 512]);
      },
    });

    const canonical = {
      _id: "book-1",
      title: "Node.js and MongoDB",
      authors: "Author",
      genre: "Software Engineering",
      description: "A practical guide",
    };
    await loadBooks([canonical]);
    await recommend("  Lập trình Node.js cho người mới bắt đầu về dữ liệu  ");

    expect(captured[0]).toContain("Node.js and MongoDB");
    expect(captured[0]).toContain("Concepts:");
    expect(captured[0]).toMatch(/programming|software engineering|practical/i);
    expect(captured[1]).toContain("Lập trình Node.js cho người mới bắt đầu về dữ liệu");
    expect(captured[1]).toMatch(/Concepts:.*programming/);
    expect(captured[1]).toMatch(/data/);
    expect(canonical).toEqual({
      _id: "book-1",
      title: "Node.js and MongoDB",
      authors: "Author",
      genre: "Software Engineering",
      description: "A practical guide",
    });
  }, 30000);

  it("preserves identifiers and returns equal-score recommendations by canonical id", async () => {
    loadMock.mockResolvedValueOnce({
      embed: async (texts) => tf.tensor2d(texts.map(() => Array(512).fill(1)), [texts.length, 512]),
    });
    await loadBooks([
      { _id: "book-z", title: "C++", authors: "Z", genre: "Programming", description: "Use \"Node.js\"" },
      { _id: "book-a", title: "MongoDB", authors: "A", genre: "Database", description: "Practical" },
    ]);

    const result = await recommend('"Node.js" C++ MongoDB');

    expect(result.books.map((book) => book._id)).toEqual(["book-a", "book-z"]);
  }, 30000);

  it("maps generic embedding failures to EMBEDDING_FAILED", async () => {
    loadMock.mockResolvedValueOnce({
      embed: async () => { throw new Error("encoder unavailable"); },
    });

    await expect(embedTexts(["shipping policy"])).rejects.toMatchObject({ code: "EMBEDDING_FAILED" });
  });

  it("keeps worker error codes while exposing only safe messages", () => {
    expect(toWorkerError(Object.assign(new Error("internal details"), { code: "MODEL_LOAD_FAILED" }), "loadBooks")).toEqual({
      code: "MODEL_LOAD_FAILED",
      error: "The recommendation model could not be loaded.",
    });
  });
});
