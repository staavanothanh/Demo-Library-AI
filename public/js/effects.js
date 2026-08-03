(() => {
  const instances = new WeakMap();
  const tiltOptions = {
    max: 5,
    scale: 1,
    perspective: 1000,
    glare: false,
    gyroscope: false,
    "full-page-listening": false,
  };

  const mediaQuery = (query) => (typeof window.matchMedia === "function" ? window.matchMedia(query) : null);
  const reducedMotion = mediaQuery("(prefers-reduced-motion: reduce)");
  const noPreference = mediaQuery("(prefers-reduced-motion: no-preference)");
  const finePointer = mediaQuery("(hover: hover) and (pointer: fine)");

  const canTilt = () => {
    if (document.visibilityState !== "visible") return false;
    if (navigator.connection?.saveData === true) return false;
    if (reducedMotion?.matches === true || noPreference?.matches === false) return false;
    if (finePointer?.matches !== true) return false;
    return (typeof window.VanillaTilt?.init === "function" || typeof Element?.prototype?.animate === "function");
  };

  const createCspSafeTilt = (element) => {
    if (typeof element.animate !== "function") return null;
    let animation;
    const clearAnimation = () => {
      if (!animation) return;
      animation.cancel();
      animation = undefined;
    };
    const reset = () => {
      clearAnimation();
      animation = element.animate([{ transform: "none" }], { duration: 160, easing: "cubic-bezier(.2,.75,.25,1)", fill: "forwards" });
    };
    const move = (event) => {
      if (event.pointerType && event.pointerType !== "mouse") return;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      const rotateY = ((x - 0.5) * tiltOptions.max * 2).toFixed(2);
      const rotateX = ((0.5 - y) * tiltOptions.max * 2).toFixed(2);
      clearAnimation();
      animation = element.animate(
        [{ transform: `perspective(${tiltOptions.perspective}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(${tiltOptions.scale}, ${tiltOptions.scale}, ${tiltOptions.scale})` }],
        { duration: 160, easing: "cubic-bezier(.2,.75,.25,1)", fill: "forwards" },
      );
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerleave", reset);
    element.addEventListener("pointercancel", reset);
    return {
      destroy: () => {
        element.removeEventListener("pointermove", move);
        element.removeEventListener("pointerleave", reset);
        element.removeEventListener("pointercancel", reset);
        clearAnimation();
      },
    };
  };

  const destroyElement = (element) => {
    const instance = instances.get(element);
    if (instance && typeof instance.destroy === "function") {
      try { instance.destroy(); } catch { /* static cover remains usable */ }
    }
    instances.delete(element);
  };

  const destroyAll = () => {
    document.querySelectorAll("[data-book-tilt]").forEach(destroyElement);
  };

  const initElement = (element) => {
    if (!canTilt() || instances.has(element)) return;
    try {
      // Vanilla Tilt is vendored for the approved version and capability gate. Its
      // implementation writes inline styles, which strict style-src blocks, so the
      // CSP-safe adapter preserves the same bounded settings through WAAPI instead.
      const instance = createCspSafeTilt(element);
      if (instance) instances.set(element, instance);
    } catch {
      destroyElement(element);
    }
  };

  const init = (root = document) => {
    if (!canTilt()) {
      destroyAll();
      return;
    }
    if (root.matches?.("[data-book-tilt]")) initElement(root);
    root.querySelectorAll?.("[data-book-tilt]").forEach(initElement);
  };

  const refresh = () => {
    if (!canTilt()) destroyAll();
    else init(document);
  };

  const listenToMedia = (query) => {
    if (!query) return;
    const listener = () => refresh();
    if (typeof query.addEventListener === "function") query.addEventListener("change", listener);
    else if (typeof query.addListener === "function") query.addListener(listener);
  };

  listenToMedia(reducedMotion);
  listenToMedia(noPreference);
  listenToMedia(finePointer);

  document.addEventListener("visibilitychange", refresh);
  document.addEventListener("htmx:load", (event) => init(event.detail?.elt || event.target));
  document.addEventListener("htmx:historyRestore", () => init(document));
  document.addEventListener("htmx:beforeCleanupElement", (event) => {
    const element = event.detail?.elt || event.target;
    if (element?.matches?.("[data-book-tilt]")) destroyElement(element);
    element?.querySelectorAll?.("[data-book-tilt]").forEach(destroyElement);
  });

  init(document);
})();
