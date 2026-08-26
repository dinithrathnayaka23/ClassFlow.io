# Database

The migrations in `backend/src/main/resources/db/migration/` are the **single source of
truth** for the ClassFlow schema. There is no second copy to keep in step.

## Setting up locally

Create an empty PostgreSQL database and point `DB_URL` at it in `backend/.env`:

```sql
CREATE DATABASE classflow;
```

That is all. Flyway runs on application startup and brings the database up to the current
version, so `mvn spring-boot:run` builds the schema on a fresh database and applies any new
migrations to an existing one.

## Applying the schema by hand

If you would rather run the SQL yourself (in pgAdmin, say), execute the files in
`backend/src/main/resources/db/migration/` in version order — `V1`, then `V2`, and so on.
Flyway's `baseline-on-migrate` setting means it picks up from there without complaint.

## Adding a migration

Add a new `V<n>__short_description.sql` file to that directory. Never edit a migration that
has already been applied: Flyway records each file's checksum and refuses to start if one
changes. Write migrations so they can also run against a database that an earlier version
already touched — `IF EXISTS` / `IF NOT EXISTS` guards are cheap and keep a file re-runnable.

## Delete behaviour

`V4__user_deletion.sql` sets the delete rules on every `users(id)` reference, and they are
worth knowing before changing anything here:

- Content a person authored, plus their enrolments, submissions, attempts, posts and
  messages, is removed with them (`ON DELETE CASCADE`).
- `activity_logs.user_id` is `ON DELETE SET NULL`, so the audit trail outlives its author
  and those entries read as "System".
- `courses.teacher_id` is `ON DELETE RESTRICT`. A course is never destroyed as a side
  effect of removing a person; the API asks the admin to reassign or delete it first.

> This directory previously held a hand-maintained `schema.sql` that duplicated the
> migrations and had already drifted from them. It was removed rather than maintained in
> parallel.
