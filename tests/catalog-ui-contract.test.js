const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("catalog progressive enhancement markup", () => {
  it("shares a stable results partial between full and fragment responses", () => {
    const page = read("views/booklist.ejs");
    const partial = read("views/partials/catalog-results.ejs");

    expect(page).toContain('include("partials/catalog-results"');
    expect(partial).toContain('id="catalog-results"');
    expect(partial).toContain('aria-busy="false"');
    expect(partial).toMatch(/role="status"|aria-live=/);
    expect(partial).toContain("pagination");
    expect(partial).not.toContain("<%- book.");
  });

  it("keeps native search and pagination semantics while adding targeted HTMX", () => {
    const page = read("views/booklist.ejs");
    const partial = read("views/partials/catalog-results.ejs");

    expect(page).toMatch(/<form[^>]+action="\/books"[^>]+method="get"/);
    expect(page).toContain('hx-get="/books"');
    expect(page).toContain('hx-target="#catalog-results"');
    expect(page).toContain('hx-push-url="true"');
    expect(page).toContain('hx-indicator="#catalog-loading"');
    expect(page).toContain('hx-disabled-elt="find button"');
    expect(page).toContain("hx-sync");
    expect(page).toContain('hx-trigger="input changed delay:350ms, search"');
    expect(page).toContain('hx-include="closest form"');
    expect(partial).toMatch(/href="\/books\?page=/);
    expect(partial).toContain('hx-target="#catalog-results"');
    expect(partial).toContain('hx-push-url="true"');
    expect(page).not.toContain("hx-boost");
  });

  it("provides an accessible loading status and escaped EJS interpolation", () => {
    const page = read("views/booklist.ejs");
    const partial = read("views/partials/catalog-results.ejs");

    expect(page).toContain('id="catalog-loading"');
    expect(page).toContain('role="status"');
    expect(partial).toContain("<%= book.title %>");
    expect(partial).toContain("<%= book.authors %>");
    expect(partial).not.toContain("<%- book.title %>");
  });

  it("returns pagination results to the top without moving search focus", () => {
    const ui = read("public/js/htmx-ui.js");

    expect(ui).toContain("state.pagination");
    expect(ui).toContain("window.scrollTo");
    expect(ui).toContain("top: 0");
    expect(ui).toContain("left: 0");
    expect(ui).toContain('(prefers-reduced-motion: reduce)');
  });
});
