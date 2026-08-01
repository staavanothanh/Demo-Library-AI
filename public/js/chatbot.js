(() => {
  const toggle = document.querySelector("[data-chat-toggle]");
  const panel = document.querySelector("[data-chat-panel]");
  const close = document.querySelector("[data-chat-close]");
  const form = document.querySelector("[data-chat-form]");
  const messages = document.querySelector("[data-chat-messages]");
  if (!toggle || !panel || !form || !messages) return;

  const appendMessage = (role, text) => {
    const element = document.createElement("p");
    element.className = `chat-message ${role}`;
    element.textContent = text;
    messages.append(element);
  };

  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
  });
  close?.addEventListener("click", () => {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = form.elements.message;
    const message = input.value.trim();
    if (!message) return;
    appendMessage("user", message);
    input.value = "";
    const csrfToken = form.elements._csrf.value;
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ message }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The assistant is unavailable.");
      appendMessage("assistant", payload.answer);
      if (payload.sources?.length) appendMessage("sources", `Sources: ${payload.sources.join(", ")}`);
      if (payload.books?.length) appendMessage("books", payload.books.map((book) => `${book.title} — ${book.price ?? ""}`).join("\n"));
    } catch (error) {
      appendMessage("assistant", error.message);
    }
  });
})();
