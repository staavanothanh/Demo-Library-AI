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

All commands below must be run from:

```powershell
D:\Learning_Programing\Semester1\05_NodeJS_Backend\session10_11
```

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

## MongoDB Atlas setup

1. Sign in to [MongoDB Atlas](https://www.mongodb.com/atlas) and create a free **M0** cluster.
2. Under **Security → Database Access**, create a database user with a strong password. Keep it private.
3. Under **Security → Network Access**, add your current IP address for local development. For a Render deployment, temporarily allow `0.0.0.0/0` only if necessary, then restrict it when you have stable outbound IP rules available.
4. Click **Connect → Drivers**, choose Node.js, and copy the SRV connection string.
5. Replace `<username>`, `<password>`, and `<cluster-url>` in `MONGODB_URI`. Encode special password characters in the URI.
6. The app uses database `Library`, collection `users`, and collection `booksforai`.
7. Run `npm run seed` once to create the starter books.

## Deploy to Render

1. Create a Git repository whose project root is `session10_11/`, then push it to GitHub. Do **not** commit `.env`.
2. In Render, choose **New → Web Service** and connect the GitHub repository.
3. If this folder is inside a larger repository, set **Root Directory** to `session10_11`.
4. Configure:
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Node version:** 22 or newer
5. Add Render environment variables:
   - `MONGODB_URI`
   - `SESSION_SECRET` (a long random secret)
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD`
   - `NODE_ENV=production`
6. Deploy. Render provides `PORT`; the app reads it automatically.
7. Open the Render URL, create a member account, browse the catalog, then sign in with the configured administrator account to add a book.

## Replace the sample catalog with the ebook dataset

The book uses a larger `book.json` dataset and the `Library.booksforai` MongoDB collection. Import it through MongoDB Atlas **Database → Collections → Add Data → Import File**, target `Library.booksforai`, then redeploy/restart the app. At startup it indexes at most 300 books to keep local TensorFlow memory and startup time suitable for a small deployment.

Dataset fields from the ebook are compatible with: `bookID`, `title`, `authors`, `averageRating`, `ratingsCount`, `textReviewsCount`, `publicationDate`, and `publisher`. Adding a `description` and `genre` improves recommendation quality.

## Security notes

- Never commit `.env`, the MongoDB URI, session secret, or administrator password.
- The browser does not receive password hashes.
- All book-management routes enforce the administrator role on the server.
- The AI finder is restricted to signed-in members and safely renders recommendation text with DOM `textContent`.
