const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("restrained visual foundation", () => {
  it("extends the existing semantic tokens without replacing the Leaf & Logic palette", () => {
    const css = read("public/css/style.css");
    expect(css).toContain("--paper:");
    expect(css).toContain("--ink:");
    expect(css).toContain("--rust:");
    expect(css).toContain("--moss:");
    expect(css).toContain("--motion-fast:");
    expect(css).toContain("--motion-medium:");
    expect(css).toContain("--decor-opacity:");
  });

  it("uses a static non-interactive home motif and reduced-motion outcomes", () => {
    const home = read("views/home.ejs");
    const css = read("public/css/style.css");
    expect(home).toContain('aria-hidden="true"');
    expect(home).toContain("hero-motif");
    expect(css).toContain("pointer-events: none");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).not.toContain("@keyframes ambient");
    expect(css).not.toContain("@keyframes spin");
  });

  it("does not introduce remote runtime assets or a global animation loop", () => {
    const source = ["views/home.ejs", "views/booklist.ejs", "views/book-detail.ejs", "views/cart.ejs", "public/js/htmx-ui.js", "public/js/effects.js"]
      .map(read)
      .join("\n");
    expect(source).not.toMatch(/https?:\/\/.*(?:script|stylesheet|cdn)/i);
    expect(source).not.toContain("requestAnimationFrame");
  });
});
