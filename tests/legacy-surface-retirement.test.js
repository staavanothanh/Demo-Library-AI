const path = require("node:path");
const ejs = require("ejs");
const request = require("supertest");
const { createApp } = require("../app");

const projectRoot = path.join(__dirname, "..");
const retiredRoute = ["/tensorflow", "chat"].join("-");
const retiredAsset = ["/js", ["recommendations", ".js"].join("")].join("/");
const retiredCta = ["Ask", "AI", "Finder"].join(" ");

function createTestApp({ recommendationClient } = {}) {
  return createApp({
    sessionStore: undefined,
    recommendationClient: recommendationClient || { recommend: async () => ({ response: "legacy recommendation", books: [] }) },
    chatbotService: {
      chat: async ({ message }) => ({ answer: message, intent: "conversation", sources: [], books: [] }),
    },
  });
}

async function renderHome(user) {
  return ejs.renderFile(path.join(projectRoot, "views/home.ejs"), {
    user,
    csrfToken: "synthetic-csrf-token",
    cartCount: 0,
    message: "",
  });
}

describe("retired standalone recommendation surface", () => {
  it("removes the legacy CTA from the authenticated homepage while keeping the catalog and assistant entries", async () => {
    const html = await renderHome({ id: "reader-1", role: "user" });

    expect(html).not.toContain(retiredCta);
    expect(html).not.toContain(`href="${retiredRoute}"`);
    expect(html).toContain('href="/booklist"');
    expect(html).toContain("Ask the assistant");
  });

  it("keeps guest registration and sign-in CTAs without the retired surface", async () => {
    const html = await renderHome(undefined);

    expect(html).toContain("Create an account");
    expect(html).toContain("Sign in");
    expect(html).not.toContain(retiredCta);
    expect(html).not.toContain(`href="${retiredRoute}"`);
  });

  it("returns the standard 404 response for the retired GET route", async () => {
    const response = await request(createTestApp()).get(retiredRoute);

    expect(response.status).toBe(404);
    expect(response.headers.location).toBeUndefined();
    expect(response.text).toContain("The page you requested was not found.");
  });

  it("returns the standard 404 response for the retired POST route without recommendation work", async () => {
    const recommend = vi.fn();
    const app = createTestApp({ recommendationClient: { recommend } });
    const response = await request(app).post(retiredRoute).send({ prompt: "legacy request" });

    expect(response.status).toBe(404);
    expect(response.headers.location).toBeUndefined();
    expect(response.text).toContain("The page you requested was not found.");
    expect(recommend).not.toHaveBeenCalled();
  });

  it("returns 404 for the retired browser asset", async () => {
    const response = await request(createTestApp()).get(retiredAsset);

    expect(response.status).toBe(404);
  });

  it("keeps the main chatbot endpoint mounted", async () => {
    const agent = request.agent(createTestApp());
    const home = await agent.get("/");
    const csrfToken = home.text.match(/name="_csrf" value="([^"]+)"/)?.[1];
    const response = await agent
      .post("/api/ai/chat")
      .set("X-CSRF-Token", csrfToken)
      .send({ message: "hello" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ answer: "hello", intent: "conversation" });
  });
});
