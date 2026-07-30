# Library + AI Recommendations

Mini-project for Sessions 10 and 11: an Express/EJS library application with MongoDB users and books, Passport session login, an administrator dashboard, and a local TensorFlow Universal Sentence Encoder recommendation feature.

## Features

- Register and sign in as a library member.
- Browse and search books by title, author, or genre.
- Ask for recommendations in natural language.
- Administrator-only book creation.
- AI embeddings run in a `worker_threads` worker, so model work does not block Express requests.
- Passwords are bcrypt-hashed; database and session secrets come from environment variables.

## Project structure

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
views/                              EJS pages and partials
public/                             Browser JavaScript and CSS
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
```

3. Seed the sample catalog:

```powershell
npm run seed
```

4. Run tests and start the app:

```powershell
npm test
npm run dev
```

Open `http://localhost:3000`.

> The administrator account is created or updated at server startup from `ADMIN_USERNAME` and `ADMIN_PASSWORD`. Sign in with those values to access `/admin-dashboard`.
