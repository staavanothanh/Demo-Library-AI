async function ensureAdmin({ User, bcrypt }) {
  const username = process.env.ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD are required.");
  await User.findOneAndUpdate(
    { username },
    { $set: { username, passwordHash: await bcrypt.hash(password, 12), role: "admin" } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
}

module.exports = { ensureAdmin };
