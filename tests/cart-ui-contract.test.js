const fs = require("node:fs");
const path = require("node:path");

describe("server-rendered cart UI contract", () => {
  const root = path.join(__dirname, "..");
  const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

  it("keeps the detail form, CSRF token, feedback target, and server cart-count hook", () => {
    const detail = read("views/book-detail.ejs");
    const header = read("views/partials/header.ejs");
    const feedback = read("views/partials/mutation-feedback.ejs");
    const count = read("views/partials/cart-count.ejs");

    expect(detail).toContain("data-cart-form");
    expect(detail).toContain('hx-post="/cart/items"');
    expect(detail).toContain('hx-target="#cart-feedback"');
    expect(detail).toContain('name="_csrf"');
    expect(header).toContain('id="cart-count"');
    expect(feedback).toContain('include("cart-count"');
    expect(count).toContain("hx-swap-oob");
  });

  it("marks every cart mutation and checkout form for targeted HTMX", () => {
    const cart = read("views/partials/cart-content.ejs");
    const count = read("views/partials/cart-count.ejs");

    expect((cart.match(/data-cart-mutation/g) || []).length).toBe(3);
    expect((cart.match(/hx-post=/g) || []).length).toBeGreaterThanOrEqual(4);
    expect((cart.match(/name="_csrf"/g) || []).length).toBeGreaterThanOrEqual(4);
    expect(cart).toContain('id="cart-content"');
    expect(cart).toContain('hx-target="#cart-content"');
    expect(cart).toContain("hx-disabled-elt");
    expect(count).toContain("hx-swap-oob");
  });

  it("does not keep a competing custom cart fetch driver", () => {
    const footer = read("views/partials/footer.ejs");
    expect(footer).toContain("/vendor/htmx.min.js");
    expect(footer).toContain("/js/htmx-ui.js");
    expect(footer).not.toContain("/js/cart.js");
    expect(fs.existsSync(path.join(root, "public/js/cart.js"))).toBe(false);
  });
});
