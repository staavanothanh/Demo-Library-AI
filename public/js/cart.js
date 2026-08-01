(() => {
  const detailForm = document.querySelector("[data-cart-form]");
  const mutationForms = [...document.querySelectorAll("[data-cart-mutation]")];
  const checkoutForm = document.querySelector("[data-checkout-form]");
  const status = document.querySelector("[data-cart-status]");
  if ((!detailForm && !mutationForms.length && !checkoutForm) || typeof window.fetch !== "function") return;

  const updateCount = (cartCount) => {
    document.querySelectorAll("[data-cart-count]").forEach((element) => {
      element.textContent = `(${cartCount})`;
    });
  };

  const showStatus = (message, success = true) => {
    if (!status) return;
    status.replaceChildren();
    status.classList.toggle("cart-status-error", !success);
    status.append(document.createTextNode(message));
    status.hidden = false;
  };

  const showAddSuccess = (cartCount) => {
    if (!status) return;
    status.replaceChildren();
    status.classList.remove("cart-status-error");
    status.append(document.createTextNode(`Added to your cart. Cart count: ${cartCount}. `));
    const link = document.createElement("a");
    link.href = "/cart";
    link.textContent = "View cart";
    status.append(link);
    status.hidden = false;
  };

  const isValidPayload = (payload) => payload?.ok === true
    && Number.isSafeInteger(payload.cartCount)
    && payload.cartCount >= 0;

  const submitForm = async (form, isDetailForm) => {
    const submit = form.querySelector("button[type=submit]");
    const csrf = form.elements._csrf;
    if (submit) {
      submit.disabled = true;
      submit.setAttribute("aria-busy", "true");
    }
    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          ...(csrf?.value ? { "X-CSRF-Token": csrf.value } : {}),
        },
        body: new URLSearchParams(new FormData(form)),
      });
      const payload = await response.json();
      if (!response.ok || !isValidPayload(payload)) throw new Error("The cart could not be updated.");
      updateCount(payload.cartCount);
      if (isDetailForm) {
        showAddSuccess(payload.cartCount);
      } else if (form === checkoutForm) {
        showStatus(payload.message || "Demo payment completed. No real payment was processed.");
        window.setTimeout(() => window.location.assign("/cart"), 400);
      } else {
        window.location.assign("/cart");
      }
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "The cart could not be updated.", false);
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.removeAttribute("aria-busy");
      }
    }
  };

  detailForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitForm(detailForm, true);
  });
  mutationForms.forEach((form) => form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitForm(form, false);
  }));
  checkoutForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitForm(checkoutForm, false);
  });
})();
