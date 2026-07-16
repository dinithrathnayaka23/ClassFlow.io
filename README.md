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

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@classflow.com` | `Admin123!` |
| Teacher | `teacher@classflow.com` | `Teacher123!` |
| Student | `student@classflow.com` | `Student123!` |

Change every seeded password and the `.env` secrets before exposing the application publicly.

## Local Development (No Docker)

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
NEXT_PUBLIC_API_URL=http://localhost:8080/api npm run dev
```

On Windows PowerShell:
```powershell
$env:NEXT_PUBLIC_API_URL="http://localhost:8080/api"
npm run dev
```

The backend defaults to `classflow/classflow` for the database. Override any backend values via environment variables documented in `backend/src/main/resources/application.yml`.

## Repository Structure

```text
.
├── backend/
│   ├── src/main/java/com/classflow/
│   │   ├── auth, security, user, course, material, quiz
│   │   ├── assignment, chat, forum, ai, admin
│   │   └── common, config
│   └── src/main/resources/db/migration/
├── frontend/
│   ├── app/
│   ├── components/workspace/
│   └── lib/
├── nginx/nginx.conf
└── docker-compose.yml
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
- Uploaded files are stored outside the database in the configured upload directory. The `FileStorage` boundary can later be replaced by S3 or Cloudflare R2.

## Deployment Notes

This MVP is designed to run with:
- Next.js frontend
- Spring Boot backend (Flyway migrations on startup)
- PostgreSQL database

If you deploy behind a reverse proxy (recommended), ensure uploads work at the configured `app.upload-dir` and CORS/secure cookie settings match your domain.

## MVP Boundaries

- The AI module currently provides deterministic platform guidance and persists Q&A logs. `AiController` is isolated so a model provider can replace the response strategy.
- The included STOMP endpoint persists and broadcasts messages; the current web UI uses REST polling as a resilient MVP fallback.
- Course enrollment is exposed as a protected API; a dedicated enrollment picker is a natural next UI enhancement.
