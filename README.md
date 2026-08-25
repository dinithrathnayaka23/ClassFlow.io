# ClassFlow

ClassFlow is a production-minded MVP for tuition classes. It gives administrators, teachers and students one role-aware workspace for courses, materials, timed quizzes, assignments, submissions, direct chat, forums and platform help.

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

## Local Development

1) Create and initialize the database (schema):
- Create a PostgreSQL database (default: `classflow`)
- Execute: `db/schema.sql`

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

All endpoints except login and health require authentication. Resource access is validated against the current user's role and course membership/ownership.

| Area | Key endpoints |
| --- | --- |
| Auth | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` |
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
