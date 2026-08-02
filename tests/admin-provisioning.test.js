const { ensureAdmin } = require("../services/adminProvisioning");

describe("admin provisioning", () => {
  const originalUsername = process.env.ADMIN_USERNAME;
  const originalPassword = process.env.ADMIN_PASSWORD;

  afterEach(() => {
    if (originalUsername === undefined) delete process.env.ADMIN_USERNAME;
    else process.env.ADMIN_USERNAME = originalUsername;
    if (originalPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = originalPassword;
  });

  it("requires configured admin credentials", async () => {
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;

    await expect(ensureAdmin({ User: {}, bcrypt: {} }))
      .rejects.toThrow("ADMIN_USERNAME and ADMIN_PASSWORD are required.");
  });

  it("upserts a normalized administrator with a hashed password", async () => {
    process.env.ADMIN_USERNAME = " AdminUser ";
    process.env.ADMIN_PASSWORD = "synthetic-admin-password";
    const calls = [];
    const User = {
      findOneAndUpdate: async (...args) => {
        calls.push(args);
        return { acknowledged: true };
      },
    };
    const bcrypt = { hash: async (password, rounds) => `${password}:${rounds}` };

    await expect(ensureAdmin({ User, bcrypt })).resolves.toBeUndefined();
    expect(calls).toEqual([[
      { username: "adminuser" },
      { $set: { username: "adminuser", passwordHash: "synthetic-admin-password:12", role: "admin" } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    ]]);
  });
});
