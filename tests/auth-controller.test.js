const { createAuthController } = require("../controllers/authController");

describe("registration conflict handling", () => {
  it("returns the registration conflict view when concurrent registration hits MongoDB's duplicate-key constraint", async () => {
    const duplicateKeyError = Object.assign(new Error("E11000 duplicate key error"), { code: 11000 });
    const User = {
      exists: async () => false,
      create: async () => { throw duplicateKeyError; },
    };
    const bcrypt = { hash: async () => "hashed-password" };
    const controller = createAuthController({ User, bcrypt });
    const response = {
      status: (code) => { response.statusCode = code; return response; },
      render: (view, data) => ({ view, data }),
    };
    const next = (error) => { throw error; };

    const result = await controller.register({
      body: { username: "  Reader  ", password: "correct-password" },
    }, response, next);

    expect(response.statusCode).toBe(409);
    expect(result).toEqual({
      view: "register",
      data: {
        errors: [{ msg: "That username is already in use." }],
        values: { username: "reader" },
      },
    });
  });

  it("forwards non-duplicate registration errors to Express", async () => {
    const databaseError = new Error("database unavailable");
    const User = {
      exists: async () => false,
      create: async () => { throw databaseError; },
    };
    const bcrypt = { hash: async () => "hashed-password" };
    const controller = createAuthController({ User, bcrypt });
    const response = { status: () => response, render: () => undefined };
    let forwardedError;

    await controller.register({
      body: { username: "Reader", password: "correct-password" },
    }, response, (error) => { forwardedError = error; });

    expect(forwardedError).toBe(databaseError);
  });
});
