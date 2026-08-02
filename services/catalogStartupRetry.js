function createCatalogStartupRetry({
  refreshBooks,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  baseDelayMs = 1000,
  maxDelayMs = 30000,
  maxAttempts = 5,
  logger = console,
} = {}) {
  if (typeof refreshBooks !== "function") throw new Error("Catalog refresh function is required.");
  if (!Number.isInteger(baseDelayMs) || baseDelayMs <= 0) throw new Error("Catalog retry base delay must be a positive integer.");
  if (!Number.isInteger(maxDelayMs) || maxDelayMs < baseDelayMs) throw new Error("Catalog retry max delay must be at least the base delay.");
  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) throw new Error("Catalog retry attempts must be a positive integer.");

  let running;
  let timer;
  let stopped = false;
  let attempt = 0;

  const schedule = () => {
    if (stopped || attempt >= maxAttempts) return;
    const delay = Math.min(maxDelayMs, baseDelayMs * (2 ** Math.max(0, attempt - 1)));
    timer = setTimeoutFn(() => {
      timer = undefined;
      running = attemptRefresh();
      return running;
    }, delay);
  };
  const attemptRefresh = async () => {
    if (stopped) return false;
    attempt += 1;
    try {
      await refreshBooks();
      logger.info?.(`AI catalog refresh succeeded on attempt ${attempt}.`);
      return true;
    } catch (error) {
      logger.error?.(`AI catalog refresh attempt ${attempt} failed: ${error.message}`);
      schedule();
      return false;
    }
  };

  return {
    start: () => {
      if (stopped) return Promise.resolve(false);
      if (running) return running;
      running = attemptRefresh();
      return running;
    },
    stop: () => {
      stopped = true;
      if (timer !== undefined) {
        clearTimeoutFn(timer);
        timer = undefined;
      }
      running = undefined;
    },
  };
}

module.exports = { createCatalogStartupRetry };
