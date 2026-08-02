const { createAdminController } = require("../controllers/adminController");

describe("admin book creation", () => {
  const body = {
    title: "Practical Node.js",
    authors: "A. Reader",
    description: "A sufficiently long description for this test book.",
    genre: "Programming",
    publisher: "Example Press",
    publicationDate: "2026-01-01",
    averageRating: "4.5",
    price: "19.99",
    stock: "3",
    coverUrl: "https://example.com/cover.jpg",
  };

  it("redirects with a pending-index message when persistence succeeds but refresh fails", async () => {
    const created = [];
    const refreshError = new Error("worker unavailable");
    const controller = createAdminController({
      Book: { create: async (payload) => { created.push(payload); return payload; } },
      recommendationClient: { refreshBooks: async () => { throw refreshError; } },
    });
    const response = { redirect: (location) => { response.location = location; } };
    const next = () => { throw new Error("next should not be called"); };
    const originalError = console.error;
    const logs = [];
    console.error = (...args) => logs.push(args.join(" "));

    try {
      await controller.addBook({ body }, response, next);
    } finally {
      console.error = originalError;
    }

    expect(created).toHaveLength(1);
    expect(created[0]).toEqual({
      title: "Practical Node.js",
      authors: "A. Reader",
      description: "A sufficiently long description for this test book.",
      genre: "Programming",
      publisher: "Example Press",
      publicationDate: "2026-01-01",
      averageRating: 4.5,
      price: 19.99,
      stock: 3,
      coverUrl: "https://example.com/cover.jpg",
    });
    expect(response.location).toBe("/admin-dashboard?message=Book added. AI index refresh is pending.");
    expect(logs.join(" ")).toContain("Book persisted but AI index refresh failed");
    expect(logs.join(" ")).toContain("worker unavailable");
  });

  it("passes persistence failures to the error handler without refreshing", async () => {
    const persistenceError = new Error("database unavailable");
    let refreshCalls = 0;
    let nextError;
    const controller = createAdminController({
      Book: { create: async () => { throw persistenceError; } },
      recommendationClient: { refreshBooks: async () => { refreshCalls += 1; } },
    });

    await controller.addBook({ body }, { redirect: () => {} }, (error) => { nextError = error; });

    expect(nextError).toBe(persistenceError);
    expect(refreshCalls).toBe(0);
  });
});
