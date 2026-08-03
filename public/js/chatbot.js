(() => {
  const toggle = document.querySelector("[data-chat-toggle]");
  const panel = document.querySelector("[data-chat-panel]");
  const close = document.querySelector("[data-chat-close]");
  const form = document.querySelector("[data-chat-form]");
  const messages = document.querySelector("[data-chat-messages]");
  if (!toggle || !panel || !form || !messages) return;

  const input = form.elements.message;
  const submit = form.querySelector("button[type=submit]");
  let lastFocusedElement = null;

  const appendMessage = (role, text) => {
    const element = document.createElement("p");
    element.className = `chat-message ${role}`;
    element.textContent = String(text ?? "");
    messages.append(element);
    messages.scrollTop = messages.scrollHeight;
  };

  const setOpen = (open) => {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      lastFocusedElement = document.activeElement;
      window.setTimeout(() => input.focus(), 0);
    } else if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      lastFocusedElement.focus();
    } else {
      toggle.focus();
    }
  };

  panel.hidden = true;
  toggle.setAttribute("aria-expanded", "false");
  toggle.addEventListener("click", () => setOpen(panel.hidden));
  close?.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) setOpen(false);
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || submit.disabled) return;
    appendMessage("user", message);
    input.value = "";
    input.disabled = true;
    submit.disabled = true;
    submit.setAttribute("aria-busy", "true");
    submit.textContent = "Sending…";
    const csrfToken = form.elements._csrf.value;
    try {
      const response = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify({ message }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The assistant is unavailable.");
      appendMessage("assistant", payload.answer);
      if (payload.sources?.length) appendMessage("sources", `Sources: ${payload.sources.join(", ")}`);
      if (payload.books?.length) appendMessage("books", payload.books.map((book) => `${book.title} — ${book.price ?? ""}`).join("\n"));
    } catch (error) {
      appendMessage("assistant", error.message || "The assistant is unavailable.");
    } finally {
      input.disabled = false;
      submit.disabled = false;
      submit.removeAttribute("aria-busy");
      submit.textContent = "Send";
      input.focus();
    }
  });
})();
