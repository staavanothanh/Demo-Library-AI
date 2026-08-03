(() => {
  const expectedErrorStatuses = new Set([400, 404, 409]);
  const focusState = new Map();

  const getTarget = (detail, eventTarget) => {
    if (eventTarget?.matches?.("[data-htmx-fragment-target], #catalog-results, #cart-content, #comments-section")) return eventTarget;
    if (detail?.target && typeof detail.target.setAttribute === "function") return detail.target;
    const source = detail?.elt || detail?.requestConfig?.elt;
    return source?.closest?.("[data-htmx-fragment-target], #catalog-results, #cart-content, #comments-section") || null;
  };

  const getLiveRegion = (target) => target?.closest?.("main")?.querySelector?.("[data-htmx-live]")
    || document.querySelector("[data-htmx-live]");

  const announce = (message, target) => {
    const region = getLiveRegion(target);
    if (!region) return;
    region.textContent = String(message);
  };

  const setBusy = (target, busy) => {
    if (!target || typeof target.setAttribute !== "function") return;
    target.setAttribute("aria-busy", String(Boolean(busy)));
  };

  const scrollCatalogToTop = () => {
    if (typeof window === "undefined" || typeof window.scrollTo !== "function") return;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    window.scrollTo({ top: 0, left: 0, behavior: reducedMotion ? "auto" : "smooth" });
  };

  const isCatalogTyping = (element) => element?.matches?.("[data-catalog-query]") === true;

  const captureFocus = (detail) => {
    const active = document.activeElement;
    const source = detail?.elt || detail?.requestConfig?.elt;
    const target = getTarget(detail);
    if (!source || !target || !active) return;
    focusState.set(target.id || "catalog-results", {
      source,
      typing: isCatalogTyping(active),
      pagination: source.matches?.(".pagination a") === true,
    });
  };

  const restoreFocus = (target) => {
    const state = focusState.get(target.id || "catalog-results");
    if (!state) return;
    focusState.delete(target.id || "catalog-results");
    if (state.typing && state.source?.isConnected) {
      state.source.focus({ preventScroll: true });
      return;
    }
    if (state.pagination) {
      const heading = target.querySelector?.("[data-catalog-heading]");
      if (!heading) return;
      if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
      scrollCatalogToTop();
    }
  };

  document.addEventListener("htmx:beforeRequest", (event) => {
    const target = getTarget(event.detail, event.target);
    captureFocus(event.detail);
    setBusy(target, true);
    if (target?.id === "catalog-results") announce("Loading catalog results.", target);
  });

  document.addEventListener("htmx:afterSwap", (event) => {
    const target = getTarget(event.detail, event.target);
    setBusy(target, false);
    restoreFocus(target);
  });

  document.addEventListener("htmx:afterSettle", (event) => {
    const target = getTarget(event.detail, event.target);
    setBusy(target, false);
    restoreFocus(target);
  });

  document.addEventListener("htmx:beforeSwap", (event) => {
    const detail = event.detail || {};
    const target = getTarget(detail);
    const status = Number(detail.xhr?.status || detail.status || 0);
    if (detail.isError && expectedErrorStatuses.has(status) && target?.matches?.("[data-htmx-fragment-target]")) {
      detail.shouldSwap = true;
      detail.isError = false;
      return;
    }
    if (detail.isError && status >= 500) {
      detail.shouldSwap = false;
      announce("We could not complete that action. Please try again.", target);
    }
  });

  document.addEventListener("htmx:responseError", (event) => {
    const target = getTarget(event.detail, event.target);
    setBusy(target, false);
    announce("We could not complete that action. Please try again.", target);
  });

  document.addEventListener("htmx:load", (event) => {
    const target = event.detail?.elt || event.target;
    if (target?.querySelectorAll) target.querySelectorAll("[aria-busy=true]").forEach((element) => setBusy(element, false));
  });

  document.addEventListener("htmx:historyRestore", () => {
    document.querySelectorAll("[aria-busy=true]").forEach((element) => setBusy(element, false));
  });

  document.addEventListener("htmx:beforeTransition", (event) => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) event.preventDefault();
  });

  document.addEventListener("htmx:oobAfterSwap", () => {
    const count = document.querySelector("[data-cart-count]");
    if (!count || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    count.classList.remove("cart-count-updated");
    void count.offsetWidth;
    count.classList.add("cart-count-updated");
    window.setTimeout(() => count.classList.remove("cart-count-updated"), 240);
  });

  if (typeof window !== "undefined" && window.htmx && typeof window.htmx.config === "object") {
    window.htmx.config.allowEval = false;
    window.htmx.config.allowScriptTags = false;
    window.htmx.config.selfRequestsOnly = true;
    window.htmx.config.historyRestoreAsHxRequest = false;
    window.htmx.config.historyCacheSize = 0;
    window.htmx.config.includeIndicatorStyles = false;
  }
})();
