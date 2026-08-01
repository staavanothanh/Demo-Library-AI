const fs = require("node:fs");
const path = require("node:path");

describe("Add to cart UI contract", () => {
  const root = path.join(__dirname, "..");

  it("keeps the detail form, live status region, and server cart-count hook", () => {
    const detail = fs.readFileSync(path.join(root, "views", "book-detail.ejs"), "utf8");
    const header = fs.readFileSync(path.join(root, "views", "partials", "header.ejs"), "utf8");

    expect(detail).toContain("data-cart-form");
    expect(detail).toContain('name="_csrf"');
    expect(detail).toContain("data-cart-status");
    expect(header).toContain("data-cart-count");
  });

  it("marks cart-page update, remove, and clear forms for enhancement", () => {
    const cart = fs.readFileSync(path.join(root, "views", "cart.ejs"), "utf8");

    expect((cart.match(/data-cart-mutation/g) || []).length).toBe(3);
    expect((cart.match(/name="_csrf"/g) || []).length).toBeGreaterThanOrEqual(4);
    expect(cart).toContain("data-cart-status");
    expect(cart).toContain("data-checkout-form");
  });

  it("handles cart mutations using safe URL-encoded fetch and server counts", () => {
    const cartScript = fs.readFileSync(path.join(root, "public", "js", "cart.js"), "utf8");

    expect(cartScript).toContain("data-cart-mutation");
    expect(cartScript).toContain("window.location.assign(\"/cart\")");
    expect(cartScript).toContain("data-checkout-form");
    expect(cartScript).toContain("Demo payment completed");
    expect(cartScript).toContain("Number.isSafeInteger(payload.cartCount)");
    expect(cartScript).toContain("X-CSRF-Token");
    expect(cartScript).not.toContain("innerHTML");
  });

  it("loads the deferred cart enhancement from the shared footer", () => {
    const footer = fs.readFileSync(path.join(root, "views", "partials", "footer.ejs"), "utf8");
    const cartScript = fs.readFileSync(path.join(root, "public", "js", "cart.js"), "utf8");

    expect(footer).toContain("/js/cart.js");
    expect(cartScript).toContain("data-cart-form");
    expect(cartScript).toContain("URLSearchParams");
    expect(cartScript).toContain("application/x-www-form-urlencoded");
    expect(cartScript).toContain('Accept: "application/json"');
    expect(cartScript).toContain("textContent");
    expect(cartScript).not.toContain("innerHTML");
  });
});
