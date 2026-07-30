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
});
