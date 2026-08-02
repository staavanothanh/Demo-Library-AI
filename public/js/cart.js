(() => {
  const detailForm = document.querySelector("[data-cart-form]");
  const mutationForms = [...document.querySelectorAll("[data-cart-mutation]")];
  const checkoutForm = document.querySelector("[data-checkout-form]");
  const status = document.querySelector("[data-cart-status]");
  const toast = document.querySelector("[data-cart-toast]");
  let toastDismissTimer;
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

  const hideToast = () => {
    if (!toast) return;
    if (toastDismissTimer) {
      window.clearTimeout(toastDismissTimer);
      toastDismissTimer = undefined;
    }
    toast.hidden = true;
    toast.replaceChildren();
  };

  const showAddSuccess = (cartCount) => {
    const message = `Added to your cart. Cart count: ${cartCount}. `;
    if (!toast) {
      showStatus(message, true);
      return;
    }
    if (status) {
      status.hidden = true;
      status.replaceChildren();
      status.classList.remove("cart-status-error");
    }
    hideToast();
    const content = document.createElement("p");
    content.className = "cart-toast-message";
    content.append(document.createTextNode(message));
    const link = document.createElement("a");
    link.href = "/cart";
    link.textContent = "View cart";
    content.append(link);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "cart-toast-close";
    close.setAttribute("aria-label", "Dismiss cart notification");
    close.textContent = "×";
    close.addEventListener("click", hideToast);
    toast.append(content, close);
    toast.hidden = false;
    toastDismissTimer = window.setTimeout(hideToast, 6000);
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
