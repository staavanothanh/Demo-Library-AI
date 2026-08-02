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
