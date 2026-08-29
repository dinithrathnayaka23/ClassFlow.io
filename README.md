# ClassFlow

ClassFlow is a production-minded platform built for tuition classes. It gives administrators,
teachers and students one role-aware workspace for courses, enrolment, materials, timed
quizzes, assignments, submissions and grading, direct chat, forums, notifications and
platform help.

The project is a modular monolith: one Spring Boot API with clear domain packages and one
Next.js client. It is intentionally straightforward to operate now and can be split into
services later if traffic or team ownership calls for it.

---

## Contents

- [Feature Tour](#feature-tour)
- [Stack](#stack)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration Reference](#configuration-reference)
- [Accounts and Roles](#accounts-and-roles)
- [Password Recovery and Mail](#password-recovery-and-mail)
- [AI Help](#ai-help)
- [File Storage](#file-storage)
- [Notifications](#notifications)
- [Repository Structure](#repository-structure)
- [API Reference](#api-reference)
- [Frontend Routes](#frontend-routes)
- [Database and Migrations](#database-and-migrations)
- [Testing](#testing)
- [Security Notes](#security-notes)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)

---

## Feature Tour

### Everyone
- Sign-in with a signed JWT held in an HTTP-only cookie; repeated failed attempts are throttled.
- A role-aware dashboard that counts **outstanding work** rather than restating status words.
- A notification bell with unread counts, mark-one/mark-all read and a clear-all action.
- Direct one-to-one chat with persisted history, unread badges and file attachments.
- A profile page: display name, avatar upload/removal and self-service password change.
- Built-in AI help that answers questions about the platform in the context of your role.
- Password recovery by single-use emailed link (teachers and students).

### Admin
- Platform statistics and a rolling activity feed.
- Paginated user directory with role filters and search; dedicated teacher and student views.
- Create admin, teacher and student accounts directly.
- Enable or disable an account, change a user's role, reset a user's password, delete a user.
- Create courses, archive/unarchive them, and delete them after reviewing a
  **deletion impact report** that spells out exactly what would be removed.

### Teacher
- Create and edit courses and their lesson plans.
- **Approve or reject enrolment requests** from students, with the requester notified either way.
- Publish materials: uploaded files, external resources, videos and live-class links.
- Author timed multiple-choice quizzes that are open only inside a start/end window.
- Review any student's submitted quiz paper question by question.
- Reopen a student's attempt so they can sit a quiz again.
- Post assignments with an optional attachment and a deadline.
- Collect multi-file submissions, download them, and record marks and feedback.
- Start forum topics and reply.

### Student
- Browse the course catalogue and **request to join** a course; withdraw a pending request.
- See enrolled courses and their lesson plans once a teacher approves.
- Open or download learning materials of every type.
- Sit timed quizzes, submit answers, receive an auto-marked score and review the paper afterwards.
- Upload one or more assignment files, swap a file out any time before the work is marked, and
  track status, marks and feedback.
- Take part in forums and chat directly with a teacher.

### Public
- The landing page shows **real platform figures** — active students, teachers, courses and
  assignments — read from a public, unauthenticated statistics endpoint rather than invented
  numbers.

---

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript 5, Tailwind CSS 3 |
| Realtime | STOMP over WebSocket (`@stomp/stompjs`) |
| Backend | Spring Boot 3.4.5 on Java 21, Spring Security, Spring Data JDBC, WebSocket |
| Data | PostgreSQL 16, Flyway migrations |
| Auth | Signed JWT (JJWT 0.12) in an HTTP-only cookie, BCrypt passwords, role and ownership checks |
| Storage | Local disk, or any S3-compatible bucket via the AWS SDK v2 |
| Mail | Brevo HTTP API or SMTP, behind one transport interface |
| AI | Google Gemini or Groq, with a deterministic built-in fallback |

---

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Java JDK | 21 | Required; the build targets 21. |
| Maven | 3.9+ | Or run it through your IDE. |
| Node.js | 22 recommended | 20+ works. |
| PostgreSQL | 16 | Any recent 14+ server is fine. |
| Docker | optional | Only needed for the containerised backend. |

---

## Quick Start

### 1. Create the database

```sql
CREATE DATABASE classflow;
```

That is the whole database setup. Flyway runs on application startup, builds the schema on a
fresh database and migrates an existing one, so there is nothing to run by hand. See
[db/README.md](db/README.md) for the details and the delete-behaviour rules.

### 2. Configure the backend

All configuration lives in a **single git-ignored file**, `backend/.env`. Create it from the
committed template and fill in your own values:

```bash
cp backend/.env.example backend/.env
```

At minimum, set `DB_URL`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `ADMIN_EMAIL` and
`ADMIN_PASSWORD`.

`JWT_SECRET` and the database credentials deliberately have **no defaults** — the application
refuses to start without them rather than falling back to something insecure. Generate a
secret (32 characters minimum) with:

```bash
openssl rand -base64 48
```

### 3. Run the API

```bash
cd backend
mvn spring-boot:run
```

The API listens on `http://localhost:8080`. `GET /api/health` confirms it is up.

### 4. Run the web client

```bash
cd frontend
npm install
npm run dev
```

The client is on `http://localhost:3000`.

**The frontend needs no environment file.** `next.config.ts` proxies `/api` and `/uploads` to
the backend, so browser requests stay same-origin and the HTTP-only auth cookie works with no
CORS or `SameSite` complications. Point `BACKEND_ORIGIN` at the API if it is not on
`http://localhost:8080`.

### 5. Sign in

Log in at `/login` with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you configured, or create a
teacher or student account at `/signup`.

---

## Configuration Reference

Every key below is read from `backend/.env`. The mapping from key to Spring property is
documented inline in [application.yml](backend/src/main/resources/application.yml).

### Database

| Key | Default | Purpose |
| --- | --- | --- |
| `DB_URL` | *(required)* | JDBC URL, e.g. `jdbc:postgresql://localhost:5432/classflow` |
| `DB_USER` | *(required)* | Database user |
| `DB_PASSWORD` | *(required)* | Database password |

### Security and server

| Key | Default | Purpose |
| --- | --- | --- |
| `JWT_SECRET` | *(required)* | Signing secret, 32+ characters. No fallback, by design. |
| `JWT_EXPIRATION_HOURS` | `12` | Token and cookie lifetime, kept to one value. |
| `SERVER_PORT` | `8080` | API port |
| `ALLOWED_ORIGIN` | `http://localhost:3000` | CORS origin, only used when not proxied |
| `SECURE_COOKIES` | `false` | **Set `true` on any HTTPS deployment.** |
| `MAX_FILE_SIZE` | `40MB` | Per uploaded file |
| `MAX_REQUEST_SIZE` | `160MB` | Per request; a submission may carry several files |

### Admin bootstrap

| Key | Default | Purpose |
| --- | --- | --- |
| `ADMIN_EMAIL` | — | The one admin account. Admins cannot self-register. |
| `ADMIN_PASSWORD` | — | Set a strong one before first startup. |
| `ADMIN_NAME` | `ClassFlow Admin` | Display name |
| `ADMIN_RESET_PASSWORD` | `false` | Set `true` for exactly one restart to rotate the password, then set it back. |

### Password recovery

| Key | Default | Purpose |
| --- | --- | --- |
| `PASSWORD_RESET_TTL_MINUTES` | `30` | How long a reset link stays usable |
| `PASSWORD_RESET_MAX_REQUESTS` | `10` | Requests allowed per address per window; `0` disables the cap |
| `PASSWORD_RESET_WINDOW_MINUTES` | `15` | The window for the cap above |

### Mail

| Key | Default | Purpose |
| --- | --- | --- |
| `MAIL_PROVIDER_ORDER` | `brevo,smtp` | Transports tried in order; first one configured wins |
| `MAIL_FROM` | — | The From address; must be one your provider has verified |
| `MAIL_FROM_NAME` | `ClassFlow` | Display name on outgoing mail |
| `MAIL_TIMEOUT_SECONDS` | `15` | Send timeout |
| `BREVO_API_KEY` | — | Enables the HTTPS transport |
| `MAIL_HOST` / `MAIL_PORT` | — / `587` | Enables the SMTP transport |
| `MAIL_USERNAME` / `MAIL_PASSWORD` | — | SMTP credentials (Gmail needs an App Password) |
| `MAIL_AUTH` / `MAIL_STARTTLS` | `true` / `true` | Set both `false` for a local MailHog |

### AI help

| Key | Default | Purpose |
| --- | --- | --- |
| `AI_PROVIDER_ORDER` | `gemini,groq` | Providers tried in order; the first that answers wins |
| `AI_TIMEOUT_SECONDS` | `20` | Per-provider timeout |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | — | From [Google AI Studio](https://aistudio.google.com/apikey) |
| `GROQ_API_KEY` / `GROQ_MODEL` | — | From the [Groq Console](https://console.groq.com/keys) |

### Object storage

| Key | Default | Purpose |
| --- | --- | --- |
| `UPLOAD_DIR` | `./uploads` | Local disk path, used when no bucket is set |
| `S3_BUCKET` | — | Set this to switch to object storage |
| `S3_ENDPOINT` | — | Provider endpoint (R2, Supabase, MinIO, AWS) |
| `S3_REGION` | `auto` | Region |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | — | Bucket credentials |

---

## Accounts and Roles

There are **no seeded or demo accounts**, and no credentials are stored in this repository.

- **Teachers and students** create their own accounts at `/signup`. Self-registration cannot
  produce an ADMIN, whatever the request body says.
- **The admin cannot be self-registered.** Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in
  `backend/.env`; `AdminBootstrap` provisions that account on the next startup, and that is
  the only way an admin is created. To rotate the password later, set
  `ADMIN_RESET_PASSWORD=true` for exactly one restart, then set it back to `false`.

Role routing on the client is a convenience only. A readable `classflow_role` cookie tells the
Next.js middleware which workspace to render; every actual permission decision is made by the
backend against the signed token, the user's role, and their ownership of or enrolment on the
resource in question.

---

## Password Recovery and Mail

Teachers and students recover their own accounts from `/forgot-password`. They receive a
single-use link, valid for `PASSWORD_RESET_TTL_MINUTES` (30 by default), that lets them choose
a new password. Saving it signs the account out on every device.

Admins are deliberately excluded. The admin account is provisioned from configuration, and it
is the account that can reset everyone else's password, so recovering it through a mailbox
would put the platform in the hands of whoever holds that mailbox. A locked-out admin uses
`ADMIN_RESET_PASSWORD` instead.

### The two transports

Mail is tried in the order given by `MAIL_PROVIDER_ORDER` (default `brevo,smtp`), and the
first one configured wins:

- **`brevo`** — Brevo's HTTP API over 443. Set `BREVO_API_KEY` and `MAIL_FROM`. **This is the
  one to use on a deployment.** Hosting platforms commonly block outbound SMTP; on Render a
  connection to port 587 times out rather than being refused, so entirely correct Gmail
  credentials fail there in a way that looks like a broken mail account. Port 443 is never
  blocked. Any provider with a send endpoint would do — Brevo is wired up because its free
  tier sends to any recipient once a sender address is verified.
- **`smtp`** — a normal SMTP server. Easiest locally, where nothing blocks the port. Gmail
  needs an App Password (and 2-step verification on the account); a local MailHog on port
  1025 needs `MAIL_AUTH=false` and `MAIL_STARTTLS=false`.

With neither configured **nothing is sent**: the message, reset link and all, is written to
the application log so the flow can be exercised with no mail account at all. That is a
development convenience only. Which mode an instance is in is reported once at startup —
`Mail is enabled via brevo: ...`, or `Mail is DISABLED - no transport is configured` — so a
deployment that is quietly logging links instead of sending them is visible immediately
rather than only when somebody reports a missing email.

### Throttling

Requests are capped per address: `PASSWORD_RESET_MAX_REQUESTS` (default 10) inside
`PASSWORD_RESET_WINDOW_MINUTES` (default 15). It is a backstop rather than a gate — a real
user never reaches it, a completed reset clears the count, and every refusal is logged.
Setting the maximum to `0` removes the cap entirely.

Sign-in uses the same limiter: 10 failed attempts against one address inside 15 minutes, with
a successful sign-in clearing the count.

---

## AI Help

Every role gets an in-app assistant that answers questions about ClassFlow itself. Providers
are tried in the order set by `AI_PROVIDER_ORDER`, and a provider with no API key is skipped:

1. **Gemini** — Google AI Studio.
2. **Groq** — Groq Console.
3. **Built-in guidance** — a deterministic fallback keyed to the platform's own features.

Because of the fallback, the feature works with no API keys at all; adding a key upgrades the
answers rather than switching the feature on. Questions and answers are persisted, and the
response records which provider served it.

---

## File Storage

Uploads — materials, assignment attachments, submissions, chat attachments and avatars — go
through a single `FileStorage` boundary with two implementations:

- **`LocalFileStorage`** writes to `UPLOAD_DIR`. Fine for local development.
- **`S3FileStorage`** writes to any S3-compatible bucket, and is selected automatically as
  soon as `S3_BUCKET` is set. Works with Cloudflare R2, Supabase Storage, MinIO and AWS S3.

**Set a bucket on any hosted deployment.** Container filesystems do not survive a redeploy, so
everything a student submitted would be lost on the next deploy if it lived on local disk.

Files are served through the application at `/uploads/**`, not by a static handler, so access
can be checked. Chat attachments and submissions are blocked from that public path outright
and are only reachable through their own authenticated endpoints, which verify that the caller
is a participant in the conversation or has rights over the submission.

---

## Notifications

`NotificationService` fans out to the right audience — the students on a course, a course's
teacher, one user, or every admin — and the bell in the app shell shows unread counts and
links straight to the relevant screen.

Events currently raised:

| Type | Goes to |
| --- | --- |
| `USER_REGISTERED` | Admins |
| `COURSE_CREATED` | Admins |
| `ENROLLMENT_REQUESTED` | The course's teacher |
| `ENROLLMENT_APPROVED` / `ENROLLMENT_REJECTED` | The student |
| `MATERIAL_ADDED` | Students on the course |
| `ASSIGNMENT_POSTED` | Students on the course |
| `QUIZ_POSTED` | Students on the course |
| `SUBMISSION_RECEIVED` | The course's teacher |
| `WORK_GRADED` | The student |
| `FORUM_TOPIC` | Students on the course |
| `PASSWORD_CHANGED` | The affected user |

---

## Repository Structure

```text
.
├── backend/
│   ├── Dockerfile                       # multi-stage build, tuned for a 512MB instance
│   ├── .env.example                     # committed template - placeholders only
│   └── src/
│       ├── main/java/com/classflow/
│       │   ├── admin/                   # platform stats and activity feed
│       │   ├── ai/                      # provider chain: Gemini, Groq, built-in
│       │   ├── assignment/              # assignments, multi-file submissions, grading
│       │   ├── auth/                    # login, registration, admin bootstrap, password reset
│       │   ├── chat/                    # REST + STOMP messaging, attachments
│       │   ├── common/                  # errors, paging, activity log, file storage
│       │   ├── course/                  # courses, lessons, enrolment approval
│       │   ├── dashboard/               # per-role outstanding-work summary
│       │   ├── forum/                   # topics and posts
│       │   ├── mail/                    # Mailer + Brevo/SMTP transports
│       │   ├── material/                # files, links, videos, live-class links
│       │   ├── notification/            # fan-out and the notification bell's API
│       │   ├── publicinfo/              # unauthenticated landing-page figures
│       │   ├── quiz/                    # timed MCQ quizzes, attempts, review
│       │   ├── security/                # JWT, cookies, filters, rate limiting
│       │   └── user/                    # directory, profile, avatars, admin actions
│       ├── main/resources/db/migration/ # Flyway V1..V10 - the schema's source of truth
│       └── test/java/com/classflow/     # focused unit tests
├── db/README.md                         # schema, migrations and delete behaviour
└── frontend/
    ├── app/                             # landing, auth screens, /[role]/[[...section]]
    ├── components/
    │   ├── AppShell.tsx                 # role-aware navigation
    │   ├── NotificationBell.tsx
    │   └── workspace/                   # one component per section
    ├── lib/                             # API client, public stats, helpers
    ├── proxy.ts                         # route guard for /admin, /teacher, /student
    └── next.config.ts                   # /api and /uploads proxy to the backend
```

---

## API Reference

Everything except login, registration, password recovery, health and public stats requires
authentication. Access is validated against the caller's role and their ownership of, or
enrolment on, the resource.

### Auth

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Public; cannot create an ADMIN |
| `POST` | `/api/auth/login` | Public; throttled after repeated failures |
| `POST` | `/api/auth/forgot-password` | Public; answers identically whether or not the address exists |
| `GET` / `POST` | `/api/auth/reset-password` | Public; validate a token, then set the new password |
| `GET` | `/api/auth/me` | Current user |
| `POST` | `/api/auth/logout` | Clears the auth cookie |

### Users

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/users` | Admin; paginated, filterable by role |
| `POST` | `/api/users` | Admin; create any role |
| `GET` | `/api/users/{id}` | Admin |
| `GET` | `/api/users/me` | Own profile |
| `PATCH` | `/api/users/me` | Update own profile |
| `POST` / `DELETE` | `/api/users/me/avatar` | Upload or remove an avatar |
| `PATCH` | `/api/users/me/password` | Change own password |
| `PATCH` | `/api/users/{id}/password` | Admin; reset another user's password |
| `PATCH` | `/api/users/{id}/status` | Admin; enable or disable |
| `PATCH` | `/api/users/{id}/role` | Admin; change role |
| `DELETE` | `/api/users/{id}` | Admin |

### Courses and enrolment

| Method | Path | Notes |
| --- | --- | --- |
| `GET` / `POST` | `/api/courses` | List or create |
| `GET` / `PATCH` | `/api/courses/{id}` | Detail; teacher or admin edit |
| `POST` / `DELETE` | `/api/courses/{id}/enroll` | Student requests to join, or withdraws |
| `GET` | `/api/courses/enrollments/mine` | The caller's enrolment statuses |
| `GET` | `/api/courses/{id}/enrollment-requests` | Teacher; pending requests |
| `PATCH` | `/api/courses/{id}/enrollment-requests/{studentId}` | Teacher; approve or reject |
| `POST` | `/api/courses/{id}/enrollments` | Direct enrolment |
| `PATCH` | `/api/courses/{id}/status` | Admin; archive or restore |
| `GET` | `/api/courses/{id}/impact` | Admin; what deleting this course would remove |
| `DELETE` | `/api/courses/{id}` | Admin |
| `GET` / `POST` | `/api/courses/{id}/lessons` | Lesson plan |
| `PATCH` / `DELETE` | `/api/courses/{id}/lessons/{lessonId}` | Edit or remove a lesson |

### Materials

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/materials` | By course |
| `POST` | `/api/materials` | Multipart; `FILE`, `LINK`, `VIDEO` or live-class link |
| `DELETE` | `/api/materials/{id}` | Also deletes the stored file |

### Quizzes

| Method | Path | Notes |
| --- | --- | --- |
| `GET` / `POST` | `/api/quizzes` | List or create |
| `GET` | `/api/quizzes/{id}` | The paper for the caller's role |
| `PATCH` / `DELETE` | `/api/quizzes/{id}` | Editing is blocked once attempts exist |
| `POST` | `/api/quizzes/{id}/start` | Opens a timed attempt |
| `POST` | `/api/quizzes/{id}/submit` | Auto-marked; refused after the window closes |
| `GET` | `/api/quizzes/{id}/review` | Own paper, or any paper on your own course |
| `GET` | `/api/quizzes/{id}/attempts` | Teacher; who has sat it |
| `DELETE` | `/api/quizzes/{id}/attempts/{studentId}` | Teacher; reopen for a resit |

### Assignments

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/assignments` | Role-scoped list |
| `GET` | `/api/assignments/limits` | Upload limits, so the client can validate first |
| `POST` | `/api/assignments` | Multipart; optional attachment |
| `POST` | `/api/assignments/{id}/submissions` | Multipart; one or more files |
| `DELETE` | `/api/assignments/submissions/{sid}/files/{fid}` | Own submission, until marked; one file must remain |
| `GET` | `/api/assignments/submissions/files/{fid}` | Authenticated download |
| `GET` | `/api/assignments/{id}/submissions` | Teacher |
| `PATCH` | `/api/assignments/submissions/{id}` | Teacher; marks and feedback |

### Chat, forums and notifications

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/chat/contacts` | Who you may message |
| `GET` | `/api/chat/unread` | Unread counts |
| `GET` | `/api/chat/messages/{otherId}` | History |
| `POST` | `/api/chat/messages` | Send |
| `POST` | `/api/chat/messages/attachment` | Send with a file |
| `GET` | `/api/chat/attachments/{messageId}` | Participants only |
| `POST` | `/api/chat/messages/{otherId}/read` | Mark a conversation read |
| — | `/ws` + `/app/chat.send` | STOMP endpoint; persists and broadcasts |
| `GET` / `POST` | `/api/forums` | Topics |
| `GET` / `POST` | `/api/forums/{id}/posts` | Replies |
| `GET` | `/api/notifications` | Paginated |
| `GET` | `/api/notifications/unread` | Badge count |
| `POST` | `/api/notifications/{id}/read`, `/api/notifications/read-all` | Mark read |
| `DELETE` | `/api/notifications` | Clear all |

### Dashboard, AI, admin and public

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/dashboard/summary` | Outstanding work for the caller's role |
| `POST` | `/api/ai/ask` | Platform help |
| `GET` | `/api/admin/stats` | Admin |
| `GET` | `/api/admin/activity` | Admin; activity feed |
| `GET` | `/api/public/stats` | **Public**; landing-page figures |
| `GET` | `/api/health` | **Public** |
| `GET` | `/uploads/**` | Public paths only; chat and submissions are denied here |

---

## Frontend Routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page with live platform figures |
| `/login`, `/signup` | Authentication |
| `/forgot-password`, `/reset-password` | Password recovery |
| `/[role]/[[...section]]` | The workspace — `admin`, `teacher` or `student` |

`proxy.ts` guards `/admin`, `/teacher` and `/student`: an unauthenticated visitor is sent to
`/login?next=...`, and someone whose role cookie does not match the path is redirected to
their own dashboard.

Sections available per role:

- **Admin** — dashboard, users, teachers, students, courses, chat, AI help, profile
- **Teacher** — dashboard, courses, materials, quizzes, assignments, submissions, chat,
  forums, AI help, profile
- **Student** — dashboard, courses, materials, quizzes, assignments, chat, forums, AI help,
  profile

---

## Database and Migrations

The files in `backend/src/main/resources/db/migration/` are the single source of truth for the
schema — there is no second copy to keep in step. Flyway runs on startup with
`baseline-on-migrate` enabled.

| Migration | Adds |
| --- | --- |
| `V1__initial_schema` | Users, courses, lessons, materials, quizzes, assignments, forums, chat, activity log |
| `V2__assignment_attachment_name` | Original filename for assignment attachments |
| `V3__user_avatar` | Profile avatars |
| `V4__user_deletion` | Delete rules on every `users(id)` reference |
| `V5__password_changed_at` | Invalidates tokens issued before a password change |
| `V6__chat_attachments` | File attachments on messages |
| `V7__enrollment_approval` | Pending/approved/rejected enrolment workflow |
| `V8__submission_files` | Multi-file submissions |
| `V9__notifications` | Notifications table |
| `V10__password_reset_tokens` | Hashed, single-use reset tokens |

Never edit a migration that has already been applied — Flyway records each file's checksum and
refuses to start if one changes. Add a new `V<n>__short_description.sql` instead.

Delete behaviour is worth knowing before changing anything: authored content, enrolments,
submissions, attempts, posts and messages cascade with their user; `activity_logs.user_id` is
`ON DELETE SET NULL` so the audit trail outlives its author; and `courses.teacher_id` is
`ON DELETE RESTRICT`, so a course is never destroyed as a side effect of removing a person.

---

## Testing

```bash
cd backend
mvn test
```

The suite covers the pieces where a silent regression would be expensive: JWT issuing and
validation, the login/reset attempt limiter, password reset token hashing and expiry, mail
transport selection and the no-transport fallback, and file storage including deletion.

---

## Security Notes

- Passwords are BCrypt-hashed. Changing a password stamps `password_changed_at`, which
  invalidates every token issued before it — a reset signs the account out everywhere.
- JWTs expire after 12 hours by default and are issued in an HTTP-only, `SameSite=Lax` cookie.
  The token and the cookie share one lifetime, so a cookie is never left holding a dead token.
- The readable role cookie is only a UI routing hint. Backend role and ownership checks remain
  authoritative.
- Sign-in is throttled: 10 failed attempts per address per 15 minutes, cleared on success.
  Every refusal is logged rather than failing silently.
- Password reset links are single use, expire quickly, and are stored only as a SHA-256
  digest, so a database dump yields no working links. Requests are throttled per address, and
  the endpoint answers identically whether or not the address is registered, so it cannot be
  used to find out who has an account.
- Admins are excluded from email recovery on purpose — see
  [Password Recovery and Mail](#password-recovery-and-mail).
- Uploaded files live outside the database. `/uploads/chat/**` and `/uploads/submissions/**`
  are denied on the public path and reachable only through endpoints that check participation
  or ownership.
- Field lengths are bounded and material URLs must be real web links, so neither can be used
  to smuggle oversized or hostile input past validation.
- **No credentials exist in this repository.** `backend/.env` is the single, git-ignored
  source of configuration; `backend/.env.example` is the committed template and holds only
  placeholders. `JWT_SECRET` and the database credentials have no defaults at all.
- There are no seeded accounts. The admin is provisioned from `ADMIN_EMAIL`/`ADMIN_PASSWORD`;
  teachers and students self-register and cannot obtain the ADMIN role.
- On any public deployment: set `SECURE_COOKIES=true`, a strong `JWT_SECRET`, and serve over
  HTTPS.

---

## Deployment

The pieces are a Next.js frontend, a Spring Boot backend that migrates its own schema on
startup, and a PostgreSQL database.

### Backend

A multi-stage `Dockerfile` is included and is tuned for a small (512MB) instance: dependencies
resolve in their own layer, the runtime image is a JRE on Alpine, and `JAVA_TOOL_OPTIONS` caps
the heap so the JVM's non-heap memory does not get the container killed. Hosts that inject
`PORT` are handled — the entrypoint maps it onto `--server.port`, because binding a port
nothing routes to fails as a silent timeout rather than an error.

```bash
docker build -t classflow-api backend/
docker run --env-file backend/.env -p 8080:8080 classflow-api
```

Without Docker, run `mvn spring-boot:run`, or `java -jar` the packaged artifact **from the
`backend/` directory** so `backend/.env` is found.

### Frontend

```bash
cd frontend
npm run build
npm start
```

The client proxies `/api` and `/uploads` to the backend itself, so **no separate reverse proxy
is required**. Point `BACKEND_ORIGIN` at the API.

### Deployment checklist

- [ ] `JWT_SECRET` set to a freshly generated 32+ character secret
- [ ] `SECURE_COOKIES=true` and HTTPS in front of both services
- [ ] `S3_BUCKET` and its credentials set — otherwise uploads vanish on redeploy
- [ ] `BREVO_API_KEY` and `MAIL_FROM` set — most hosts block outbound SMTP
- [ ] Startup log checked for `Mail is enabled via ...` rather than `Mail is DISABLED`
- [ ] `ADMIN_EMAIL` / `ADMIN_PASSWORD` set, and `ADMIN_RESET_PASSWORD` back to `false`
- [ ] `BACKEND_ORIGIN` on the frontend pointing at the API
- [ ] Database reachable and `GET /api/health` returning healthy

---

## Troubleshooting

**The application will not start, complaining about a missing property.**
`JWT_SECRET`, `DB_URL`, `DB_USER` or `DB_PASSWORD` is missing from `backend/.env`. These have
no defaults on purpose — failing loudly beats starting with an insecure fallback.

**Reset emails never arrive.**
Check the startup log. `Mail is DISABLED - no transport is configured` means the link was
written to the log instead of sent. If it says SMTP is enabled but sends time out, your host
is blocking port 587 — switch to `BREVO_API_KEY`.

**Uploads disappear after a deploy.**
No `S3_BUCKET` is set, so files went to a container filesystem that did not survive.

**Sign-in reports too many attempts.**
The limiter has tripped: 10 failures per address per 15 minutes. Wait out the window, or sign
in successfully to clear that address's count.

**Flyway refuses to start, reporting a checksum mismatch.**
An already-applied migration was edited. Restore the file and add a new migration instead.

**The client cannot reach the API.**
Set `BACKEND_ORIGIN` if the backend is not on `http://localhost:8080`. Requests go through the
Next.js proxy so that the auth cookie stays same-origin; calling the backend directly from the
browser will lose the cookie.

---

## Roadmap

- The STOMP endpoint persists and broadcasts messages; the current web UI uses REST polling as
  a resilient fallback, and can be moved fully onto the socket.
- Quizzes are multiple-choice only; short-answer and file-answer question types are the
  natural next step.
- Notifications are in-app; the mail transport is already in place to deliver digests.
- The AI assistant answers about the platform. Grounding it in a course's own materials is an
  obvious extension of the existing provider chain.
