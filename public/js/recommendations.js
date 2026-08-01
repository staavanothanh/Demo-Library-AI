(() => {
  const form = document.querySelector("#recommendation-form");
  const prompt = document.querySelector("#prompt");
  const result = document.querySelector("#recommendation-result");
  if (!form || !prompt || !result) return;
  const submit = form.querySelector("button[type=submit]");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = prompt.value.trim();
    if (!value || submit.disabled) return;
    result.textContent = "Finding recommendations…";
    submit.disabled = true;
    submit.setAttribute("aria-busy", "true");
    submit.textContent = "Searching…";
    try {
      const response = await fetch("/tensorflow-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: value }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to get recommendations.");
      const heading = document.createElement("p");
      heading.textContent = data.response || "Here are a few thoughtful matches.";
      const list = document.createElement("ol");
      (data.books || []).forEach((book) => {
        const item = document.createElement("li");
        item.textContent = `${book.title} — ${book.authors} (match: ${book.score})`;
        list.append(item);
      });
      result.replaceChildren(heading, list);
    } catch (error) {
      result.textContent = error.message || "Unable to get recommendations.";
    } finally {
      submit.disabled = false;
      submit.removeAttribute("aria-busy");
      submit.textContent = "Find books";
    }
  });
})();
