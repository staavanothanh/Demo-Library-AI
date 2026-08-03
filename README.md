# Leaf & Logic Books — Bookstore MVP

Mini-project for Sessions 10 and 11: an Express/EJS bookstore MVP with MongoDB users/books/comments/policy chunks, Passport sessions, an Express-session cart, fake checkout, TensorFlow retrieval, and an OpenCode Zen chatbot.

## Features

- Public paginated bookstore catalog with product detail pages.
- Server-side Express-session cart and fake checkout; no real payment or order persistence.
- Public comments with authenticated posting.
- Progressive enhancement for catalog, cart, checkout, and comments using targeted self-hosted HTMX fragments; native links/forms remain canonical.
- A restrained product-cover tilt enhancement using the exact, self-hosted `vanilla-tilt@1.8.1` package (disabled for reduced motion, touch, coarse pointers, save-data, and hidden tabs).
- Floating chatbot for policy retrieval, book information, and recommendations.
- Policy answers are grounded in indexed internal demo documents and refuse unsupported questions.
- OpenCode Zen provider failures are handled without stopping the web process.

- Register and sign in as a library member.
- Browse and search books by title, author, or genre.
- Ask for recommendations in natural language.
- Administrator-only book creation.
- AI embeddings run in a `worker_threads` worker, so model work does not block Express requests.
- Passwords are bcrypt-hashed; database and session secrets come from environment variables.

## Project structure

```text
models/Comment.js                   Public comments
models/KnowledgeChunk.js             Indexed policy chunks
services/cartService.js              Immutable session-cart calculations
services/sessionTransitionState.js   Allowlisted state across auth rotation
services/policyIndexer.js            Deterministic Markdown policy indexing
services/policyService.js            Atlas/fallback policy retrieval
services/chatbotService.js           Intent routing and safe provider context
services/chatbotRuntime.js            Shared policy/vector/provider composition
services/aiProviders/openCodeZenProvider.js  OpenCode Zen adapter
middleware/csrf.js                   Session-backed mutation protection
```

```text
server.js                           Runtime entry point: database, sessions, admin setup, listener
app.js                              Express application factory and middleware/router composition
config/passport.js                  Passport Local strategy and session serialization
controllers/                        Auth, catalog, admin, and recommendation request handlers
routes/                             URL declarations, validation chains, and access guards
models/                             User and Book Mongoose models
middleware/                         Authentication/authorization and shared validation helpers
services/recommendationClient.js    Worker client and book-index refresh boundary
services/tensorflowWorker.js        Background AI worker
services/tensorflowService.js       USE embeddings and cosine similarity
scripts/seedBooks.js                Seed catalog
scripts/verifyAiData.js             Read-only AI/catalog/policy diagnostics
scripts/chatbotCli.js               Direct interactive/one-shot chatbot harness
views/                              EJS pages and partials
public/                             Browser JavaScript and CSS
public/vendor/                      Self-hosted, lockfile-pinned HTMX and Vanilla Tilt assets
tests/                              Vitest/Supertest checks
```

## Run locally

1. Copy `.env.example` to `.env`.
2. Fill in the values:

```env
PORT=3000
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/Library?retryWrites=true&w=majority
SESSION_SECRET=use-a-long-random-string
ADMIN_USERNAME=admin
ADMIN_PASSWORD=choose-a-strong-password
NODE_ENV=development
TRUST_PROXY_HOPS=0
```

`TRUST_PROXY_HOPS` is the number of reverse-proxy hops that the application is allowed to trust:

- Local HTTP development: `TRUST_PROXY_HOPS=0`.
- Render production: set `NODE_ENV=production` and `TRUST_PROXY_HOPS=1`. Render terminates HTTPS at one forwarding hop before Node.js. Keep the session cookie secure; do not work around this by disabling `Secure`.

Keep one canonical browser origin during local testing (`localhost` and `127.0.0.1` are different cookie hosts). `connect.sid` is `HttpOnly`, so it is expected not to appear in `document.cookie`; inspect it through browser DevTools Network/Application storage. After changing `SESSION_SECRET`, proxy topology, host, or port, clear stale cookies and reload the page so the hidden CSRF token and session cookie belong to the same session.

### Render deployment checklist

Configure these values in Render's service environment, not in committed files:

```env
NODE_ENV=production
TRUST_PROXY_HOPS=1
SESSION_SECRET=<stable-long-random-secret>
MONGODB_URI=<configured-in-render-secret>
```

Render supplies `PORT`; do not hard-code a production port. Use the same canonical HTTPS hostname for login and subsequent form submissions. After changing the session secret or proxy setting, redeploy and clear the old site cookie before testing again. A forwarded-HTTPS `GET /login` should return a `connect.sid` cookie with `Secure; HttpOnly; SameSite=Lax`.

3. Bootstrap the data in this order. These commands write MongoDB and should be run manually only in an authorized environment:

```powershell
npm run catalog:migrate
npm run seed
npm run policies:index
npm run ai:verify
```

`npm run ai:verify` is read-only. It reports book/policy counts, embedding dimensions, invalid embeddings, recommendation readiness, and Atlas index readiness without printing secrets or connection strings.

4. Configure OpenCode Zen using the variables in `.env.example`, then verify the provider without printing the key:

```powershell
npm run ai:smoke
```

For Atlas Vector Search, create a `knowledge_chunks` vector index named by `POLICY_VECTOR_INDEX_NAME` with:

- path: `embedding`
- dimensions: `512`
- similarity: `cosine`

The diagnostic reports a missing or invalid index. The application may use the normalized in-memory cosine fallback when Atlas is unavailable, but policy chunks must still be valid `category: "policy"` documents with 512-dimensional finite embeddings.

5. Run tests and start the app:

```powershell
npm test
npm run test:coverage
npm run dev
```

Coverage currently enforces 80% minimum global thresholds for statements, branches, functions, and lines. The in-process rate limiter is suitable for a single Node.js instance; use a shared atomic store before deploying multiple instances. The startup AI catalog refresh retries with bounded backoff and is independent of HTTP availability.

Open `http://localhost:3000`.

## Direct chatbot CLI

The CLI talks directly to the real chatbot service stack—MongoDB policy retrieval, Atlas Vector Search (with the existing safe fallback), the TensorFlow recommendation worker, canonical book lookup, and OpenCode Zen—without starting the web server or using browser cookies/CSRF.

It still loads the normal runtime configuration, can use provider quota, and must be run only in an authorized environment. Do not paste secrets into prompts. The CLI is not a replacement for browser E2E coverage of sessions, CSRF, rate limits, or UI behavior.

The CLI disables Mongoose `autoCreate` and `autoIndex` to avoid automatic schema/index side effects, and its code performs no data mutations. Strongest read-only protection at the MongoDB layer still requires credentials limited to the `read` role on the `Library` database; these Mongoose options do not turn an Atlas Admin credential into a read-only credential.

Interactive mode:

```powershell
npm run chatbot:cli
```

Inside the session, use `/help`, `/status`, `/clear`, or `/exit`. `/status` prints only recommendation readiness, the public provider/model name, and (when set) `en`/`vi`. A command such as `reply in Vietnamese` persists the validated language preference for the rest of that interactive process. `/clear` removes only the four-item chat history and retains the language preference; `--no-history` also keeps the language preference while sending an empty history on every turn.

Machine-readable one-shot mode:

```powershell
npm run chatbot:ask -- --prompt "what is your shipping policy?" --json
npm run chatbot:ask -- --prompt "recommend for me a book related to data" --json
npm run chatbot:ask -- --prompt "Chính sách vận chuyển của bạn là gì?" --json
```

The final result line starts with `CHATBOT_RESULT_JSON=`. Success results contain `ok`, `answer`, `intent`, `sources`, and canonical `books`; complete provider responses may add allowlisted `generation` metadata (`provider`, `model`, `finishReason`, and finite token counts). One-shot mode starts with no preference and never persists state to disk. Failure results contain safe `code`, `stage`, `intent`, `candidateCount`, `canonicalCount`, and `message`; they never include connection strings, credentials, headers, cookies, session history, stack traces, or raw upstream payloads. Exit code `0` means the chatbot returned a result; exit code `1` means validation or runtime failure.

Policy topics use deterministic English/Vietnamese accented and unaccented aliases to choose a narrow canonical source (`shipping.md`, `returns.md`, and so on) before semantic retrieval. The indexed policy corpus remains English: Vietnamese grounded fallbacks use a fixed Vietnamese preface followed by an exact English excerpt, not an unreviewed machine translation. Recommendation retrieval appends bounded bilingual concept labels to its private embedding text while preserving the original prompt and canonical book records.

OpenCode Zen uses at most two total attempts for transient network, timeout, rate-limit, and 5xx failures within the configured request deadline. A response stopped by the provider's token limit is reported as `TRUNCATED_RESPONSE` and is never exposed as partial text. When policy evidence or canonical books are available, the chatbot returns a deterministic grounded fallback instead of discarding that evidence; with no grounding it refuses safely.

> The administrator account is created or updated at server startup from `ADMIN_USERNAME` and `ADMIN_PASSWORD`. Sign in with those values to access `/admin-dashboard`.
