const path = require("path");
const { Worker } = require("worker_threads");

function createRecommendationClient({ Book, workerFactory = () => new Worker(path.join(__dirname, "tensorflowWorker.js")) }) {
  let worker;
  let sequence = 0;
  let catalogBooks;
  let catalogVersion = 0;
  let catalogWorker;
  let catalogWorkerVersion = 0;
  let catalogLoad;
  let catalogFetch;
  let stopped = false;
  const pendingRequests = new Map();

  const cloneBooks = (books) => (Array.isArray(books) ? books.map((book) => ({ ...book })) : []);
  const clearCatalogLoad = (load) => {
    if (catalogLoad !== load) return;
    catalogLoad = undefined;
    if (catalogWorker === load.worker) {
      catalogWorker = undefined;
      catalogWorkerVersion = 0;
    }
  };
  const rejectWorkerRequests = (targetWorker, error) => {
    for (const [requestId, pending] of pendingRequests) {
      if (pending.worker !== targetWorker) continue;
      pendingRequests.delete(requestId);
      pending.reject(error);
    }
  };
  const ensureWorker = () => {
    if (stopped) throw new Error("Recommendation worker is shutting down.");
    if (worker) return worker;
    const nextWorker = workerFactory();
    worker = nextWorker;
    const handleWorkerFailure = (error) => {
      if (worker !== nextWorker) return;
      if (catalogLoad?.worker === nextWorker) catalogLoad = undefined;
      if (catalogWorker === nextWorker) {
        catalogWorker = undefined;
        catalogWorkerVersion = 0;
      }
      worker = undefined;
      rejectWorkerRequests(nextWorker, error);
    };
    nextWorker.on("message", (message) => {
      const pending = pendingRequests.get(message.requestId);
      if (!pending || pending.worker !== nextWorker) return;
      pendingRequests.delete(message.requestId);
      if (message.error) {
        if (pending.catalogLoad) clearCatalogLoad(pending.catalogLoad);
        return pending.reject(new Error(message.error));
      }
      if (pending.catalogLoad) {
        const load = pending.catalogLoad;
        if (catalogLoad === load) {
          catalogLoad = undefined;
          catalogWorker = nextWorker;
          catalogWorkerVersion = load.version;
        }
      }
      return pending.resolve(message);
    });
    nextWorker.on("error", handleWorkerFailure);
    nextWorker.on("exit", (code) => handleWorkerFailure(new Error(`Recommendation worker exited with code ${code}.`)));
    return nextWorker;
  };
  const sendToWorker = (targetWorker, payload, metadata = {}) => {
    const requestId = String(++sequence);
    const promise = new Promise((resolve, reject) => {
      pendingRequests.set(requestId, { worker: targetWorker, resolve, reject, ...metadata });
      try {
        targetWorker.postMessage({ ...payload, requestId });
      } catch (error) {
        pendingRequests.delete(requestId);
        if (metadata.catalogLoad) clearCatalogLoad(metadata.catalogLoad);
        reject(error);
      }
    });
    return { requestId, promise };
  };
  const send = (payload) => {
    try {
      return sendToWorker(ensureWorker(), payload).promise;
    } catch (error) {
      return Promise.reject(error);
    }
  };
  const startCatalogLoad = (targetWorker, version) => {
    const load = { worker: targetWorker, version, requestId: String(sequence + 1) };
    catalogLoad = load;
    const sent = sendToWorker(targetWorker, { type: "loadBooks", books: cloneBooks(catalogBooks) }, { catalogLoad: load });
    load.requestId = sent.requestId;
    load.promise = sent.promise;
    return load.promise;
  };
  const ensureCatalog = async (retryLoadFailure = false) => {
    if (!catalogBooks) {
      await fetchCatalog();
    }
    let lastLoadResult;
    while (true) {
      const targetWorker = ensureWorker();
      if (catalogWorker === targetWorker && catalogWorkerVersion === catalogVersion) return lastLoadResult;
      const loadResult = catalogLoad?.worker === targetWorker
        ? catalogLoad.promise
        : startCatalogLoad(targetWorker, catalogVersion);
      try {
        lastLoadResult = await loadResult;
      } catch (error) {
        if (!retryLoadFailure || error?.message === "Recommendation worker stopped.") throw error;
        retryLoadFailure = false;
        continue;
      }
    }
  };
  const loadLatestCatalog = async () => {
    await ensureCatalog(false);
    if (catalogWorkerVersion !== catalogVersion) return ensureCatalog(false);
    return undefined;
  };
  const fetchCatalog = () => {
    if (catalogFetch) return catalogFetch;
    catalogFetch = Promise.resolve()
      .then(() => Book.find({}).lean())
      .then((books) => {
        catalogBooks = cloneBooks(books);
        catalogVersion += 1;
        return catalogBooks;
      })
      .finally(() => {
        catalogFetch = undefined;
      });
    return catalogFetch;
  };
  return {
    refreshBooks: async () => {
      await fetchCatalog();
      return ensureCatalog(false);
    },
    recommend: async (prompt) => {
      await loadLatestCatalog();
      return send({ type: "recommend", prompt });
    },
    embed: async (text) => {
      const result = await send({ type: "embedTexts", texts: [text] });
      return result.embeddings[0] || [];
    },
    embedMany: async (texts) => {
      const result = await send({ type: "embedTexts", texts });
      return result.embeddings || [];
    },
    stop: async () => {
      stopped = true;
      const currentWorker = worker;
      if (!currentWorker) return;
      worker = undefined;
      if (catalogLoad?.worker === currentWorker) catalogLoad = undefined;
      if (catalogWorker === currentWorker) {
        catalogWorker = undefined;
        catalogWorkerVersion = 0;
      }
      rejectWorkerRequests(currentWorker, new Error("Recommendation worker stopped."));
      await currentWorker.terminate();
    },
  };
}

module.exports = { createRecommendationClient };
