const { isHtmxRequest, varyOnHtmx } = require("../middleware/requestMode");

describe("HTMX request mode", () => {
  it("recognizes only the exact HX-Request true value", () => {
    expect(isHtmxRequest({ get: () => "true" })).toBe(true);
    expect(isHtmxRequest({ get: () => "TRUE" })).toBe(false);
    expect(isHtmxRequest({ get: () => " true " })).toBe(false);
    expect(isHtmxRequest({ get: () => "false" })).toBe(false);
    expect(isHtmxRequest({ get: () => undefined })).toBe(false);
  });

  it("supports plain request header objects without treating malformed values as HTMX", () => {
    expect(isHtmxRequest({ headers: { "hx-request": "true" } })).toBe(true);
    expect(isHtmxRequest({ headers: { "HX-Request": "true" } })).toBe(true);
    expect(isHtmxRequest({ headers: { "hx-request": ["true"] } })).toBe(false);
    expect(isHtmxRequest({})).toBe(false);
  });

  it("merges HX-Request into an existing Vary header", () => {
    const response = { vary: vi.fn() };

    expect(varyOnHtmx(response)).toBe(response);
    expect(response.vary).toHaveBeenCalledWith("HX-Request");
  });

  it("does not make authorization or CSRF decisions", () => {
    const request = { get: () => "true", user: undefined, body: {} };

    expect(isHtmxRequest(request)).toBe(true);
    expect(request.user).toBeUndefined();
    expect(request.body._csrf).toBeUndefined();
  });
});
