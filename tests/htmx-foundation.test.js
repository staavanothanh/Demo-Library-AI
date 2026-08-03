const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("HTMX foundation contract", () => {
  it("pins the approved packages exactly", () => {
    const packageJson = JSON.parse(read("package.json"));

    expect(packageJson.dependencies["htmx.org"]).toBe("2.0.10");
    expect(packageJson.dependencies["vanilla-tilt"]).toBe("1.8.1");
  });

  it("self-hosts documented vendor assets and loads HTMX before the UI lifecycle", () => {
    const header = read("views/partials/header.ejs");
    const footer = read("views/partials/footer.ejs");
    const provenance = read("public/vendor/README.md");

    expect(fs.existsSync(path.join(root, "public/vendor/htmx.min.js"))).toBe(true);
    expect(fs.existsSync(path.join(root, "public/vendor/vanilla-tilt.min.js"))).toBe(true);
    expect(provenance).toContain("htmx.org 2.0.10");
    expect(provenance).toContain("vanilla-tilt 1.8.1");
    expect(footer.indexOf("/vendor/htmx.min.js")).toBeGreaterThanOrEqual(0);
    expect(footer.indexOf("/vendor/htmx.min.js")).toBeLessThan(footer.indexOf("/js/htmx-ui.js"));
    expect(header).not.toMatch(/https?:\/\/[^"']*(htmx|vanilla-tilt)/i);
    expect(footer).not.toMatch(/https?:\/\/[^"']*(htmx|vanilla-tilt)/i);
  });

  it("declares a CSP-safe HTMX configuration without executable inline code", () => {
    const header = read("views/partials/header.ejs");
    const ui = read("public/js/htmx-ui.js");
    expect(header).toContain('name="htmx-config"');
    expect(header).toContain('"allowEval":false');
    expect(header).toContain('"allowScriptTags":false');
    expect(header).toContain('"selfRequestsOnly":true');
    expect(header).toContain('"historyRestoreAsHxRequest":false');
    expect(header).toContain('"historyCacheSize":0');
    expect(header).toContain('"includeIndicatorStyles":false');
    expect(header).not.toMatch(/<script[^>]*>/i);
    expect(ui).toContain("htmx:beforeTransition");
  });

  it("keeps targeted enhancement and strict same-origin policy", () => {
    const views = fs.readdirSync(path.join(root, "views"), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ejs"))
      .map((entry) => read(path.join("views", entry.name)));
    const partials = fs.readdirSync(path.join(root, "views/partials"))
      .filter((name) => name.endsWith(".ejs"))
      .map((name) => read(path.join("views/partials", name)));
    const source = [...views, ...partials].join("\n");

    expect(source).not.toContain("hx-boost");
    expect(source).not.toMatch(/hx-on\s*:/i);
    expect(source).not.toMatch(/\bjs:/i);
    expect(source).not.toMatch(/onclick\s*=/i);
    expect(source).not.toMatch(/style\s*=/i);
    expect(read("middleware/csp.js")).not.toContain("unsafe-inline");
    expect(read("middleware/csp.js")).not.toContain("unsafe-eval");
  });
});
