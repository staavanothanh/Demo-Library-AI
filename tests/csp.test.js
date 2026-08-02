const request = require("supertest");
const { createApp } = require("../app");

describe("content security policy", () => {
  it("emits a restrictive same-origin policy without inline execution", async () => {
    const app = createApp({
      recommendationClient: {
        recommend: async () => ({ response: "ok", books: [] }),
        embed: async () => [],
        embedMany: async () => [],
      },
      chatbotService: { chat: async () => ({ answer: "ok", intent: "book-information", sources: [], books: [] }) },
    });

    const response = await request(app).get("/login");
    const policy = response.headers["content-security-policy"];

    expect(response.status).toBe(200);
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("script-src-attr 'none'");
    expect(policy).toContain("style-src 'self'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("img-src 'self' data: http: https:");
    expect(policy).not.toContain("'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain("default-src *");
  });
});
