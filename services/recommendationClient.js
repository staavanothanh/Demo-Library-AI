const path = require("path");
const { Worker } = require("worker_threads");

const READINESS = {
  LOADING: "loading",
  READY: "ready",
  EMPTY: "empty",
  FAILED: "failed",
  STOPPED: "stopped",
};

function createError(error, fallbackCode, fallbackMessage) {
  if (error instanceof Error && error.code) return error;
  const wrapped = new Error(error?.message || fallbackMessage);
  wrapped.code = error?.code || fallbackCode;
  return wrapped;
}

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
  let readiness = {
    status: READINESS.LOADING,
    catalogCount: 0,
    catalogVersion: 0,
    lastErrorCode: undefined,
  };
  const pendingRequests = new Map();

  const setReadiness = (status, details = {}) => {
    readiness = { ...readiness, status, ...details };
  };
  const getStatus = () => ({ ...readiness });
  const cloneBooks = (books) => (Array.isArray(books) ? books.map((book) => {
    const clone = { ...book };
    if (book?._id !== undefined && book?._id !== null) clone._id = String(book._id);
    return clone;
  }) : []);
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
  const handleWorkerFailure = (targetWorker, error) => {
    if (worker !== targetWorker || stopped) return;
    const safeError = createError(error, "RECOMMENDATION_FAILED", "Recommendation worker failed.");
    if (catalogLoad?.worker === targetWorker) clearCatalogLoad(catalogLoad);
    if (catalogWorker === targetWorker) {
      catalogWorker = undefined;
      catalogWorkerVersion = 0;
    }
    worker = undefined;
    setReadiness(READINESS.FAILED, { lastErrorCode: safeError.code });
    rejectWorkerRequests(targetWorker, safeError);
  };
  const ensureWorker = () => {
    if (stopped) throw createError(new Error("Recommendation worker is shutting down."), "RECOMMENDATION_FAILED", "Recommendation worker is shutting down.");
    if (worker) return worker;
    const nextWorker = workerFactory();
    worker = nextWorker;
    if (catalogBooks?.length) setReadiness(READINESS.LOADING, { lastErrorCode: undefined });
    nextWorker.on("message", (message) => {
      const pending = pendingRequests.get(message.requestId);
      if (!pending || pending.worker !== nextWorker) return;
      pendingRequests.delete(message.requestId);
      if (message.error) {
        const fallbackCode = pending.catalogLoad ? "MODEL_LOAD_FAILED" : pending.type === "embedTexts" ? "EMBEDDING_FAILED" : "RECOMMENDATION_FAILED";
        const error = createError({ message: message.error, code: message.code }, fallbackCode, message.error);
        if (pending.catalogLoad) clearCatalogLoad(pending.catalogLoad);
        setReadiness(error.code === "CATALOG_EMPTY" ? READINESS.EMPTY : READINESS.FAILED, {
          catalogCount: error.code === "CATALOG_EMPTY" ? 0 : readiness.catalogCount,
          lastErrorCode: error.code,
        });
        return pending.reject(error);
      }
      if (pending.catalogLoad) {
        const load = pending.catalogLoad;
        if (catalogLoad === load) {
          catalogLoad = undefined;
          catalogWorker = nextWorker;
          catalogWorkerVersion = load.version;
          setReadiness(READINESS.READY, {
            catalogCount: catalogBooks?.length || 0,
            catalogVersion: catalogVersion,
            lastErrorCode: undefined,
          });
        }
      }
      return pending.resolve(message);
    });
    nextWorker.on("error", (error) => handleWorkerFailure(nextWorker, error));
    nextWorker.on("exit", (code) => handleWorkerFailure(nextWorker, new Error(`Recommendation worker exited with code ${code}.`)));
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
        reject(createError(error, metadata.catalogLoad ? "MODEL_LOAD_FAILED" : "RECOMMENDATION_FAILED", "Recommendation worker could not accept the request."));
      }
    });
    return { requestId, promise };
  };
  const send = (payload) => {
    try {
      return sendToWorker(ensureWorker(), payload, { type: payload.type }).promise;
    } catch (error) {
      return Promise.reject(error);
    }
  };
  const startCatalogLoad = (targetWorker, version) => {
    const load = { worker: targetWorker, version, requestId: String(sequence + 1) };
    catalogLoad = load;
    const sent = sendToWorker(targetWorker, { type: "loadBooks", books: cloneBooks(catalogBooks) }, { catalogLoad: load, type: "loadBooks" });
    load.requestId = sent.requestId;
    load.promise = sent.promise;
    return load.promise;
  };
  const fetchCatalog = () => {
    if (catalogFetch) return catalogFetch;
    catalogFetch = Promise.resolve()
      .then(() => Book.find({}).lean())
      .then((books) => {
        catalogBooks = cloneBooks(books);
        catalogVersion += 1;
        if (catalogBooks.length) {
          setReadiness(READINESS.LOADING, { catalogCount: catalogBooks.length, catalogVersion, lastErrorCode: undefined });
        } else {
          setReadiness(READINESS.EMPTY, { catalogCount: 0, catalogVersion, lastErrorCode: "CATALOG_EMPTY" });
        }
        return catalogBooks;
      })
      .catch((error) => {
        const safeError = createError(error, "RECOMMENDATION_FAILED", "The book catalog could not be loaded.");
        setReadiness(READINESS.FAILED, { lastErrorCode: safeError.code });
        throw safeError;
      })
      .finally(() => {
        catalogFetch = undefined;
      });
    return catalogFetch;
  };
  const ensureCatalog = async (retryLoadFailure = false) => {
    if (!catalogBooks) await fetchCatalog();
    if (!catalogBooks.length) {
      const error = createError(new Error("The recommendation catalog is empty."), "CATALOG_EMPTY", "The recommendation catalog is empty.");
      setReadiness(READINESS.EMPTY, { catalogCount: 0, lastErrorCode: error.code });
      throw error;
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
      return result.embeddings?.[0] || [];
    },
    embedMany: async (texts) => {
      const result = await send({ type: "embedTexts", texts });
      return result.embeddings || [];
    },
    getStatus,
    stop: async () => {
      stopped = true;
      setReadiness(READINESS.STOPPED, { lastErrorCode: undefined });
      const currentWorker = worker;
      if (!currentWorker) return;
      worker = undefined;
      if (catalogLoad?.worker === currentWorker) catalogLoad = undefined;
      if (catalogWorker === currentWorker) {
        catalogWorker = undefined;
        catalogWorkerVersion = 0;
      }
      rejectWorkerRequests(currentWorker, createError(new Error("Recommendation worker stopped."), "RECOMMENDATION_FAILED", "Recommendation worker stopped."));
      await currentWorker.terminate();
    },
  };
}

module.exports = { createRecommendationClient, READINESS };
