# ClassFlow

ClassFlow is a production-minded platform built for tuition classes. It gives administrators, teachers and students one role-aware workspace for courses, materials, timed quizzes, assignments, submissions, direct chat, forums and platform help.

The project is a modular monolith: one Spring Boot API with clear domain packages and one Next.js client. It is intentionally straightforward to operate now and can be split into services later if traffic or team ownership calls for it.

## What Works

### Admin
- JWT login with an HTTP-only authentication cookie
- Platform statistics and activity overview
- Paginated user lists, role filters and account enable/disable
- Create admin, teacher and student accounts
- View and create courses

### Teacher
- Create courses and lesson plans
- Add downloadable files, external resources, videos and live-class links
- Create available-for-a-window timed MCQ quizzes
- View assignments and all student submissions
- Download submissions and add marks/feedback
- Create forum topics and reply
- Persisted student chat
- Platform AI help

### Student
- View enrolled courses and lesson plans
- Open/download learning materials
- Start timed quizzes, submit answers and receive auto-marked scores
- Upload assignment files and view status, marks and feedback
- Participate in forums
- Persisted teacher chat
- Platform AI help

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15, TypeScript, Tailwind CSS |
| Backend | Spring Boot 3, Spring Security, Spring JDBC, WebSocket/STOMP |
| Data | PostgreSQL 16, Flyway migrations |
| Auth | Signed JWT in HTTP-only cookie, BCrypt passwords, role checks |

## Quick Start (Local)

Start PostgreSQL, then run the Flyway schema/migrations via the backend (Flyway runs on startup by default).

### Configuration

All backend configuration lives in a single git-ignored file, `backend/.env`. Create it from the
committed template and fill in your own values:

```bash
cp backend/.env.example backend/.env
```

`JWT_SECRET` and the database credentials have no defaults - the application refuses to start
without them, by design. Generate a secret with `openssl rand -base64 48`.

### Accounts

There are no seeded or demo accounts, and no credentials are stored in this repository.

- **Teachers and students** create their own accounts at `/signup`.
- **The admin cannot be self-registered.** Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in
  `backend/.env`; `AdminBootstrap` provisions that account on the next startup and it is the
  only way an admin is created. To rotate the password later, set `ADMIN_RESET_PASSWORD=true`
  for exactly one restart, then set it back to `false`.

### Forgotten passwords

Teachers and students recover their own accounts from `/forgot-password`: they receive a
single-use link, valid for `PASSWORD_RESET_TTL_MINUTES` (30 by default), that lets them choose
a new password. Saving it signs the account out on every device.

Admins are deliberately excluded. The admin account is provisioned from configuration, and it
is the account that can reset everyone else's password, so recovering it through a mailbox
would put the platform in the hands of whoever holds that mailbox. A locked-out admin uses
`ADMIN_RESET_PASSWORD` instead.

Mail has two transports, tried in the order given by `MAIL_PROVIDER_ORDER` (default
`brevo,smtp`), and the first one configured wins:

- **`brevo`** - Brevo's HTTP API over 443. Set `BREVO_API_KEY` and `MAIL_FROM`. **This is the
  one to use on a deployment.** Hosting platforms commonly block outbound SMTP; on Render a
  connection to port 587 times out rather than being refused, so entirely correct Gmail
  credentials fail there in a way that looks like a broken mail account. Port 443 is never
  blocked. Any provider with a send endpoint would do - Brevo is wired up because its free
  tier sends to any recipient once a sender address is verified.
- **`smtp`** - a normal SMTP server. Easiest locally, where nothing blocks the port.

With neither configured nothing is sent: the message, reset link and all, is written to the
application log so the flow can be exercised with no mail account at all. That is a
development convenience only. Which mode an instance is in is reported once at startup
(`Mail is enabled via brevo: ...`, or `Mail is DISABLED - no transport is configured`), so a
deployment that is quietly logging links instead of sending them is visible immediately
rather than only when somebody reports a missing email.

Requests are capped per address - `PASSWORD_RESET_MAX_REQUESTS` (default 10) inside
`PASSWORD_RESET_WINDOW_MINUTES` (default 15) - so nobody can bury a mailbox in reset mail or
burn the sending quota. It is a backstop rather than a gate: a real user never reaches it, a
completed reset clears the count, and every refusal is logged. Setting the maximum to `0`
removes the cap entirely.

## Local Development

1) Create the database:
- Create an empty PostgreSQL database (default: `classflow`) and point `DB_URL` at it.
- Flyway builds and migrates the schema on startup, so there is nothing to run by hand.
  See `db/README.md` for the details.

2) Run the API (Java 21 and Maven required):
```bash
cd backend
mvn spring-boot:run
```

3) Run the web client (Node.js 22 recommended):
```bash
cd frontend
npm install
npm run dev
```

The client needs no environment file. `next.config.ts` proxies `/api` and `/uploads` to the
backend, so browser requests stay same-origin and the HTTP-only auth cookie works without CORS.
Override the target with `BACKEND_ORIGIN` if the API is not on `http://localhost:8080`.

All backend values come from `backend/.env` (see `backend/.env.example`); the keys they map to are documented in `backend/src/main/resources/application.yml`.

## Repository Structure

```text
.
├── backend/
│   ├── src/main/java/com/classflow/
│   │   ├── auth, security, user, course, material, quiz
│   │   ├── assignment, chat, forum, ai, admin
│   │   └── common, config
│   └── src/main/resources/db/migration/
└── frontend/
    ├── app/
    ├── components/workspace/
    └── lib/
```

## API Summary

All endpoints except login, registration, password recovery and health require authentication. Resource access is validated against the current user's role and course membership/ownership.

| Area | Key endpoints |
| --- | --- |
| Auth | `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`, `POST /api/auth/logout` |
| Password recovery | `POST /api/auth/forgot-password`, `GET/POST /api/auth/reset-password` (public; teachers and students only) |
| Users | `GET/POST /api/users`, `PATCH /api/users/me`, `PATCH /api/users/{id}/status` |
| Courses | `GET/POST /api/courses`, `GET /api/courses/{id}`, `POST /api/courses/{id}/enrollments`, lesson endpoints |
| Materials | `GET/POST /api/materials`, `DELETE /api/materials/{id}` |
| Quizzes | `GET/POST /api/quizzes`, `GET /api/quizzes/{id}`, `POST /api/quizzes/{id}/start`, `POST /api/quizzes/{id}/submit` |
| Assignments | `GET/POST /api/assignments`, submission and grading endpoints |
| Forums | `GET/POST /api/forums`, topic post endpoints |
| Chat | contact/history/send REST endpoints and STOMP `/ws` with `/app/chat.send` |
| AI help | `POST /api/ai/ask` |
| Admin | `GET /api/admin/stats`, `GET /api/admin/activity` |

## Security Notes

- Passwords are BCrypt-hashed.
- JWTs expire after 12 hours by default and are issued in an HTTP-only, `SameSite=Lax` cookie.
- The readable role cookie is only a UI routing hint. Backend role and ownership checks remain authoritative.
- Set `SECURE_COOKIES=true`, a strong `JWT_SECRET`, and HTTPS on a public deployment.
- No credentials exist in this repository. `backend/.env` is the single, git-ignored source of
  configuration; `backend/.env.example` is the committed template and holds only placeholders.
- There are no seeded accounts. The admin is provisioned from `ADMIN_EMAIL`/`ADMIN_PASSWORD`;
  teachers and students self-register and cannot obtain the ADMIN role.
- Password reset links are single use, expire quickly, and are stored only as a SHA-256 digest,
  so a database dump yields no working links. Requesting one is throttled per address and
  answers identically whether or not the address is registered, so it cannot be used to find
  out who has an account.
- Uploaded files are stored outside the database in the configured upload directory. The `FileStorage` boundary can later be replaced by S3 or Cloudflare R2.

## Deployment Notes

This MVP is designed to run with:
- Next.js frontend
- Spring Boot backend (Flyway migrations on startup)
- PostgreSQL database

The project is not containerised: run the API with `mvn spring-boot:run` (or `java -jar` the
packaged artifact from `backend/`, so `backend/.env` is found) and the client with `npm run build`
followed by `npm start`.

The client proxies `/api` and `/uploads` to the backend itself via `next.config.ts`, so no
separate reverse proxy is required. Point `BACKEND_ORIGIN` at the API and set `SECURE_COOKIES=true`
plus HTTPS when deploying publicly. Ensure the configured `app.upload-dir` is writable.

## MVP Boundaries

- The AI module currently provides deterministic platform guidance and persists Q&A logs. `AiController` is isolated so a model provider can replace the response strategy.
- The included STOMP endpoint persists and broadcasts messages; the current web UI uses REST polling as a resilient MVP fallback.
- Course enrollment is exposed as a protected API; a dedicated enrollment picker is a natural next UI enhancement.
