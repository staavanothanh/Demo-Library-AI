const mongoose = require("mongoose");
const { createCommentController } = require("../controllers/commentController");

function commentsResult(value) {
  const query = {
    sort: () => query,
    populate: () => query,
    lean: async () => value,
  };
  return query;
}

function response() {
  const result = { calls: [], statusCode: 200 };
  result.status = (code) => { result.statusCode = code; return result; };
  result.render = (view, data) => { result.calls.push({ view, data }); return result.calls.at(-1); };
  result.json = (body) => body;
  result.redirect = (location) => ({ location });
  return result;
}

describe("comment HTMX response contract", () => {
  it("reloads canonical populated comments and returns only the section fragment", async () => {
    const bookId = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();
    const canonical = [{ body: "<escaped by EJS>", userId: { username: "reader" } }];
    let created;
    const Comment = {
      create: async (payload) => { created = payload; },
      find: () => commentsResult(canonical),
    };
    const Book = { exists: async () => true };
    const controller = createCommentController({ Comment, Book });
    const req = {
      params: { id: bookId },
      body: { body: "  canonical text  " },
      user: { _id: userId },
      get: (name) => name.toLowerCase() === "hx-request" ? "true" : "text/html",
    };
    const res = response();

    await controller.create(req, res, (error) => { throw error; });

    expect(created).toEqual({ bookId, userId, body: "canonical text" });
    expect(res.calls[0].view).toBe("partials/comments-section");
    expect(res.calls[0].data.comments).toBe(canonical);
    expect(res.calls[0].data.comments[0].body).toContain("<escaped");
  });

  it("keeps native redirects and returns safe validation fragments for HTMX", async () => {
    const bookId = new mongoose.Types.ObjectId().toString();
    const controller = createCommentController({ Comment: { create: async () => undefined }, Book: { exists: async () => true } });
    const native = response();
    const nativeResult = await controller.create({ params: { id: bookId }, body: { body: "valid" }, user: { _id: "user" }, get: () => "text/html" }, native, (error) => { throw error; });
    expect(nativeResult.location).toBe(`/books/${bookId}`);

    const htmx = response();
    await controller.create({ params: { id: bookId }, body: { body: "   " }, user: { _id: "user" }, get: () => "true" }, htmx, (error) => { throw error; });
    expect(htmx.statusCode).toBe(400);
    expect(htmx.calls[0].view).toMatch(/partials\/(comments-section|mutation-feedback)/);
  });

  it("keeps the canonical composer constraints in the partial", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const partial = fs.readFileSync(path.join(__dirname, "..", "views", "partials", "comments-section.ejs"), "utf8");

    expect(partial).toContain('maxlength="1000"');
    expect(partial).toContain('aria-describedby="comment-body-help"');
    expect(partial).toContain('name="_csrf"');
    expect(partial).toContain('hx-target="#comments-section"');
    expect(partial).not.toContain("<%- comment.body %>");
  });
});
