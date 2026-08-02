const { createCatalogStartupRetry } = require("../services/catalogStartupRetry");

function createScheduler() {
  let nextId = 0;
  const timers = new Map();
  return {
    setTimeout: (callback, delay) => {
      const id = ++nextId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    pending: () => [...timers.values()],
    runNext: async () => {
      const [id, timer] = timers.entries().next().value || [];
      if (!timer) return;
      timers.delete(id);
      await timer.callback();
    },
  };
}

describe("catalog startup retry", () => {
  it("retries failed refreshes with bounded exponential delays and stops after success", async () => {
    const scheduler = createScheduler();
    const attempts = [];
    const logs = [];
    const outcomes = [new Error("worker unavailable"), new Error("still unavailable"), "ready"];
    const retry = createCatalogStartupRetry({
      refreshBooks: async () => {
        attempts.push(attempts.length + 1);
        const outcome = outcomes.shift();
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
      setTimeoutFn: scheduler.setTimeout,
      clearTimeoutFn: scheduler.clearTimeout,
      baseDelayMs: 100,
      maxDelayMs: 150,
      maxAttempts: 5,
      logger: { info: (message) => logs.push(["info", message]), error: (message) => logs.push(["error", message]) },
    });

    await expect(retry.start()).resolves.toBe(false);
    expect(attempts).toEqual([1]);
    expect(scheduler.pending().map((timer) => timer.delay)).toEqual([100]);

    await scheduler.runNext();
    expect(attempts).toEqual([1, 2]);
    expect(scheduler.pending().map((timer) => timer.delay)).toEqual([150]);

    await scheduler.runNext();
    expect(attempts).toEqual([1, 2, 3]);
    expect(scheduler.pending()).toHaveLength(0);
    expect(logs.filter(([level]) => level === "info")).toHaveLength(1);
  });

  it("prevents overlapping refreshes and cancels future retries on stop", async () => {
    const scheduler = createScheduler();
    let resolveRefresh;
    let calls = 0;
    const retry = createCatalogStartupRetry({
      refreshBooks: () => {
        calls += 1;
        return new Promise((resolve) => { resolveRefresh = resolve; });
      },
      setTimeoutFn: scheduler.setTimeout,
      clearTimeoutFn: scheduler.clearTimeout,
      baseDelayMs: 10,
      maxAttempts: 3,
    });

    const first = retry.start();
    const second = retry.start();
    expect(calls).toBe(1);
    expect(second).toBe(first);

    retry.stop();
    resolveRefresh();
    await expect(first).resolves.toBe(true);
    expect(scheduler.pending()).toHaveLength(0);

    await retry.start();
    expect(calls).toBe(1);
  });
});
