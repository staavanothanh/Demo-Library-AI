const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("editorial effects contract", () => {
  it("limits the tilt hook to the product cover", () => {
    const detail = read("views/book-detail.ejs");
    const list = read("views/booklist.ejs");
    expect((detail.match(/data-book-tilt/g) || []).length).toBe(1);
    expect(detail).toContain("/vendor/vanilla-tilt.min.js");
    expect(detail).toContain("/js/effects.js");
    expect(list).not.toContain("data-book-tilt");
  });

  it("guards Vanilla Tilt with motion, pointer, save-data, and visibility checks", () => {
    const effects = read("public/js/effects.js");

    expect(effects).toContain("prefers-reduced-motion");
    expect(effects).toContain("pointer: fine");
    expect(effects).toContain("hover: hover");
    expect(effects).toContain("saveData");
    expect(effects).toContain("visibilityState");
    expect(effects).toContain("destroy");
    expect(effects).toContain("matchMedia");
    expect(effects).toContain("element.animate");
    expect(effects).not.toContain("element.style");
    expect(effects).not.toContain("requestAnimationFrame");
    expect(effects).toMatch(/max\s*:\s*[1-6]/);
    expect(effects).toMatch(/scale\s*:\s*1/);
    expect(effects).toContain("glare: false");
    expect(effects).toContain("gyroscope: false");
    expect(effects).toMatch(/full-page-listening["']?\s*:\s*false/);
  });

  it("keeps static and reduced-motion fallbacks in the document and CSS", () => {
    const detail = read("views/book-detail.ejs");
    const css = read("public/css/style.css");
    expect(detail).toContain("product-cover");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("product-media");
    expect(css).not.toContain("WebGL");
  });
});
