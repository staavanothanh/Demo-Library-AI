const { EventEmitter } = require("node:events");
const { createRecommendationClient } = require("../services/recommendationClient");

class FakeWorker extends EventEmitter {
  constructor() {
    super();
    this.messages = [];
    this.terminated = false;
  }

  postMessage(message) {
    this.messages.push(message);
  }

  async terminate() {
    this.terminated = true;
    this.emit("exit", 0);
    return 0;
  }
}

const BOOKS_A = [{ _id: "book-a", title: "Book A", authors: "Author A" }];
const BOOKS_B = [{ _id: "book-b", title: "Book B", authors: "Author B" }];

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function reply(worker, message, payload = {}) {
  worker.emit("message", { requestId: message.requestId, ...payload });
}

function createClient({ getBooks = () => BOOKS_A } = {}) {
  const workers = [];
  let findCalls = 0;
  const client = createRecommendationClient({
    Book: {
      find: () => ({
        lean: async () => {
          findCalls += 1;
          return getBooks();
        },
      }),
    },
    workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
  });
  return { client, workers, getFindCalls: () => findCalls };
}

describe("recommendation catalog recovery", () => {
  it("exposes a ready status after a non-empty catalog is loaded", async () => {
    const { client, workers } = createClient();
    const refresh = client.refreshBooks();
    await flush();
    expect(client.getStatus()).toMatchObject({ status: "loading", catalogCount: 1 });
    reply(workers[0], workers[0].messages[0], { response: "loaded", books: [] });

    await expect(refresh).resolves.toMatchObject({ response: "loaded" });
    expect(client.getStatus()).toMatchObject({ status: "ready", catalogCount: 1, catalogVersion: 1 });
  });

  it("reports an empty catalog without creating a worker", async () => {
    const { client, workers } = createClient({ getBooks: () => [] });

    await expect(client.refreshBooks()).rejects.toMatchObject({ code: "CATALOG_EMPTY" });
    expect(client.getStatus()).toMatchObject({ status: "empty", catalogCount: 0, lastErrorCode: "CATALOG_EMPTY" });
    expect(workers).toHaveLength(0);
  });

  it("preserves worker error codes and exposes failed readiness", async () => {
    const { client, workers } = createClient();
    const refresh = client.refreshBooks();
    await flush();
    reply(workers[0], workers[0].messages[0], { error: "model unavailable", code: "MODEL_LOAD_FAILED" });

    await expect(refresh).rejects.toMatchObject({ code: "MODEL_LOAD_FAILED" });
    expect(client.getStatus()).toMatchObject({ status: "failed", lastErrorCode: "MODEL_LOAD_FAILED" });
  });

  it("reports embedding failures with a diagnostic code", async () => {
    const { client, workers } = createClient();
    const embedding = client.embed("shipping policy");
    await flush();
    reply(workers[0], workers[0].messages[0], { error: "embedding unavailable", code: "EMBEDDING_FAILED" });

    await expect(embedding).rejects.toMatchObject({ code: "EMBEDDING_FAILED" });
    expect(client.getStatus()).toMatchObject({ status: "failed", lastErrorCode: "EMBEDDING_FAILED" });
  });

  it("retains the initial snapshot after a load error and retries it for a later request", async () => {
    const { client, workers, getFindCalls } = createClient();
    const initialRefresh = client.refreshBooks();
    await flush();

    expect(workers).toHaveLength(1);
    expect(workers[0].messages[0]).toMatchObject({ type: "loadBooks", books: BOOKS_A });
    reply(workers[0], workers[0].messages[0], { error: "model unavailable" });
    await expect(initialRefresh).rejects.toThrow("model unavailable");

    const recommendation = client.recommend("backend APIs");
    await flush();
    expect(workers[0].messages[1]).toMatchObject({ type: "loadBooks", books: BOOKS_A });
    reply(workers[0], workers[0].messages[1], { response: "loaded", books: [] });
    await flush();
    expect(workers[0].messages[2]).toMatchObject({ type: "recommend", prompt: "backend APIs" });
    reply(workers[0], workers[0].messages[2], { response: "matches", books: BOOKS_A });

    await expect(recommendation).resolves.toMatchObject({ response: "matches", books: BOOKS_A });
    expect(getFindCalls()).toBe(1);
  });

  it("waits for an in-flight startup refresh before sending a recommendation", async () => {
    const workers = [];
    let resolveBooks;
    const booksPromise = new Promise((resolve) => { resolveBooks = resolve; });
    const client = createRecommendationClient({
      Book: { find: () => ({ lean: () => booksPromise }) },
      workerFactory: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });

    const refresh = client.refreshBooks();
    const recommendation = client.recommend("concurrency");
    expect(workers).toHaveLength(0);

    resolveBooks(BOOKS_A);
    await flush();
    expect(workers).toHaveLength(1);
    expect(workers[0].messages).toHaveLength(1);
    expect(workers[0].messages[0]).toMatchObject({ type: "loadBooks", books: BOOKS_A });
    reply(workers[0], workers[0].messages[0], { response: "loaded", books: [] });
    await flush();
    expect(workers[0].messages[1]).toMatchObject({ type: "recommend", prompt: "concurrency" });
    reply(workers[0], workers[0].messages[1], { response: "matches", books: [] });

    await expect(refresh).resolves.toMatchObject({ response: "loaded" });
    await expect(recommendation).resolves.toMatchObject({ response: "matches" });
  });

  it("rehydrates a replacement worker after a successful catalog load", async () => {
    const { client, workers, getFindCalls } = createClient();
    const refresh = client.refreshBooks();
    await flush();
    reply(workers[0], workers[0].messages[0], { response: "loaded", books: [] });
    await expect(refresh).resolves.toMatchObject({ response: "loaded" });

    workers[0].emit("exit", 1);
    const recommendation = client.recommend("JavaScript");
    await flush();

    expect(workers).toHaveLength(2);
    expect(workers[1].messages[0]).toMatchObject({ type: "loadBooks", books: BOOKS_A });
    reply(workers[1], workers[1].messages[0], { response: "loaded", books: [] });
    await flush();
    expect(workers[1].messages[1]).toMatchObject({ type: "recommend", prompt: "JavaScript" });
    reply(workers[1], workers[1].messages[1], { response: "matches", books: BOOKS_A });

    await expect(recommendation).resolves.toMatchObject({ response: "matches", books: BOOKS_A });
    expect(getFindCalls()).toBe(1);
  });

  it("waits for the newest snapshot when refreshes overlap", async () => {
    const workers = [];
    let fetchCalls = 0;
    const client = createRecommendationClient({
      Book: {
        find: () => ({
          lean: async () => {
            fetchCalls += 1;
            return fetchCalls === 1 ? BOOKS_A : BOOKS_B;
          },
        }),
      },
      workerFactory: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });

    const firstRefresh = client.refreshBooks();
    await flush();
    const secondRefresh = client.refreshBooks();
    await flush();
    expect(workers[0].messages[0]).toMatchObject({ type: "loadBooks", books: BOOKS_A });

    reply(workers[0], workers[0].messages[0], { response: "loaded A", books: [] });
    await flush();
    expect(workers[0].messages[1]).toMatchObject({ type: "loadBooks", books: BOOKS_B });
    reply(workers[0], workers[0].messages[1], { response: "loaded B", books: [] });

    await expect(firstRefresh).resolves.toMatchObject({ response: "loaded B" });
    await expect(secondRefresh).resolves.toMatchObject({ response: "loaded B" });
  });

  it("uses the latest fetched snapshot after a refresh is interrupted", async () => {
    let currentBooks = BOOKS_A;
    const { client, workers, getFindCalls } = createClient({ getBooks: () => currentBooks });
    const initialRefresh = client.refreshBooks();
    await flush();
    reply(workers[0], workers[0].messages[0], { response: "loaded", books: [] });
    await expect(initialRefresh).resolves.toMatchObject({ response: "loaded" });

    currentBooks = BOOKS_B;
    const interruptedRefresh = client.refreshBooks();
    await flush();
    expect(workers[0].messages[1]).toMatchObject({ type: "loadBooks", books: BOOKS_B });
    workers[0].emit("exit", 1);
    await expect(interruptedRefresh).rejects.toThrow("exited with code 1");

    const recommendation = client.recommend("new arrivals");
    await flush();
    expect(workers).toHaveLength(2);
    expect(workers[1].messages[0]).toMatchObject({ type: "loadBooks", books: BOOKS_B });
    reply(workers[1], workers[1].messages[0], { response: "loaded", books: [] });
    await flush();
    expect(workers[1].messages[1]).toMatchObject({ type: "recommend", prompt: "new arrivals" });
    reply(workers[1], workers[1].messages[1], { response: "matches", books: BOOKS_B });

    await expect(recommendation).resolves.toMatchObject({ response: "matches", books: BOOKS_B });
    expect(getFindCalls()).toBe(2);
  });

  it("rejects new work after stop without creating a replacement worker", async () => {
    const { client, workers } = createClient();
    await client.stop();
    await expect(client.embed("after stop")).rejects.toThrow("shutting down");
    expect(workers).toHaveLength(0);
  });

  it("rejects pending work after exit or stop and permits a fresh worker", async () => {
    const { client, workers } = createClient();
    const first = client.embed("first");
    await flush();
    workers[0].emit("exit", 0);
    await expect(first).rejects.toThrow("exited with code 0");

    const second = client.embed("second");
    await flush();
    expect(workers).toHaveLength(2);
    await client.stop();
    await expect(second).rejects.toThrow("worker stopped");
    expect(workers[1].terminated).toBe(true);
  });
});
