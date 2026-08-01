const request = require("supertest");
const { createApp } = require("../app");

describe("production session cookie proxy configuration", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalProxyHops = process.env.TRUST_PROXY_HOPS;

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalProxyHops === undefined) delete process.env.TRUST_PROXY_HOPS;
    else process.env.TRUST_PROXY_HOPS = originalProxyHops;
  });

  function createConfiguredApp({ nodeEnv = "production", proxyHops = "1" } = {}) {
    process.env.NODE_ENV = nodeEnv;
    process.env.TRUST_PROXY_HOPS = proxyHops;
    return createApp({
      sessionStore: undefined,
      recommendationClient: {
        recommend: async () => ({ response: "", books: [] }),
      },
      chatbotService: {
        chat: async () => ({ answer: "", intent: "out-of-scope", sources: [], books: [] }),
      },
    });
  }

  it("emits a secure session cookie for Render's trusted forwarded HTTPS hop", async () => {
    const response = await request(createConfiguredApp())
      .get("/login")
      .set("X-Forwarded-Proto", "https");
    const cookies = response.headers["set-cookie"] || [];

    expect(response.status).toBe(200);
    expect(cookies.join(";")).toMatch(/connect\.sid=.*Secure/);
    expect(cookies.join(";")).toMatch(/HttpOnly/);
    expect(cookies.join(";")).toMatch(/SameSite=Lax/);
  });

  it("does not trust forwarded HTTPS when proxy hops are disabled", async () => {
    const response = await request(createConfiguredApp({ proxyHops: "0" }))
      .get("/login")
      .set("X-Forwarded-Proto", "https");

    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it.each(["-1", "1.5", "abc", "11"])("rejects invalid TRUST_PROXY_HOPS value %s", async (proxyHops) => {
    expect(() => createConfiguredApp({ proxyHops })).toThrow("TRUST_PROXY_HOPS must be an integer from 0 to 10.");
  });
});
