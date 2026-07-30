const form = document.querySelector("#recommendation-form");
const prompt = document.querySelector("#prompt");
const result = document.querySelector("#recommendation-result");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  result.textContent = "Finding recommendations…";
  try {
    const response = await fetch("/tensorflow-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: prompt.value }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to get recommendations.");
    const heading = document.createElement("p");
    heading.textContent = data.response;
    const list = document.createElement("ol");
    data.books.forEach((book) => {
      const item = document.createElement("li");
      item.textContent = `${book.title} — ${book.authors} (match: ${book.score})`;
      list.append(item);
    });
    result.replaceChildren(heading, list);
  } catch (error) { result.textContent = error.message; }
});
