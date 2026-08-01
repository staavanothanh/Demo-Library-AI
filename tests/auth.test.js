const request = require("supertest");
const { createApp } = require("../app");

describe("Library routes", () => {
  const app = createApp({
    sessionStore: undefined,
    recommendationClient: {
      recommend: async (prompt) => ({
        response: `Recommendations for ${prompt}`,
        books: [{ title: "Node.js Design Patterns", authors: "Mario Casciaro", score: 0.91 }],
      }),
    },
  });

  it("redirects anonymous recommendation requests to sign-in", async () => {
    const response = await request(app)
      .post("/tensorflow-chat")
      .set("Content-Type", "application/json")
      .send({ prompt: "   " });

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain("/login?message=");
  });

  it("does not expose the admin dashboard to anonymous visitors", async () => {
    const response = await request(app).get("/admin-dashboard");

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain("/login?message=");
  });

  it("renders public home and auth pages", async () => {
    const [home, register, login] = await Promise.all([
      request(app).get("/"),
      request(app).get("/register"),
      request(app).get("/login"),
    ]);

    expect(home.status).toBe(200);
    expect(register.status).toBe(200);
    expect(login.status).toBe(200);
  });

  it("keeps registration validation errors on the registration view", async () => {
    const agent = request.agent(app);
    const form = await agent.get("/register");
    const csrfToken = form.text.match(/name="_csrf" value="([^"]+)"/)?.[1];
    const response = await agent
      .post("/register")
      .type("form")
      .send({ username: "a", password: "short", _csrf: csrfToken });

    expect(response.status).toBe(422);
    expect(response.text).toContain("Username must be 3–30 characters.");
    expect(response.text).toContain("Password must contain at least 8 characters.");
  });

  it("preserves the administrator alias redirect", async () => {
    const response = await request(app).get("/admin");

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/admin-dashboard");
  });

  it("renders the existing not-found response", async () => {
    const response = await request(app).get("/missing-page");

    expect(response.status).toBe(404);
    expect(response.text).toContain("The page you requested was not found.");
  });
});
