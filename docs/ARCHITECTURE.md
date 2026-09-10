# Architecture and design decisions

Companion to the README. This file records *why* the system is shaped the way it
is, including the places where the implementation deliberately departs from the
original specification.

---

## 1. Where the rules live

The single most important decision: **business rules live in PostgreSQL, not in
React.**

| Rule | Where it is enforced |
| --- | --- |
| Only approved episodes can be scheduled | `app.validate_schedule()` trigger |
| Slots cannot overlap | `EXCLUDE USING gist` constraint |
| A rejection needs a reason | RPC guard + CHECK constraint |
| Submitted content is frozen | `app.guard_episode_update()` trigger |
| Only QC approves | `approve_episode()` role check |
| An RJ touches only their own content | `app.can_edit_episode()` in RLS policies |
| A completed broadcast never returns to air | `app.guard_schedule_status()` trigger |
| Nobody promotes themselves | `app.guard_profile_update()` trigger |

The consequence: the API surface is safe even if the frontend is bypassed
entirely. `tests/specs/02-authorization.spec.ts` is written from the point of
view of an attacker holding a valid JWT and calling the database directly.

The frontend mirror of these rules lives in `src/lib/permissions.ts`, and its
header says plainly that it decides what to *draw*, not what is *allowed*. When
the two disagree, the database wins and the user gets a clear error rather than
a broken screen.

## 2. Deviations from the specification

The brief asked for a better design to be proposed where one exists. Four
changes were made.

### 2.1 Episode status excludes SCHEDULED, ON_AIR and COMPLETED

**Specified:** `DRAFT → PENDING_QC → APPROVED → SCHEDULED → ON_AIR → COMPLETED`
as a single episode status.

**Implemented:** two independent lifecycles.

```
episodes.status   DRAFT → PENDING_QC → APPROVED | REJECTED   (+ ARCHIVED)
schedules.status  SCHEDULED → ON_AIR → COMPLETED | CANCELLED
```

**Why:** those last three describe a *broadcast*, not a piece of *content*. An
approved episode can be scheduled twice — a rerun next week, a repeat during
exam season. The moment that happens, a single `SCHEDULED` flag on the episode
is lying: is it scheduled, on air, or completed? All three, on different slots.

Keeping them separate means "is this episode scheduled?" is a join
(`schedules where episode_id = ? and status in ('SCHEDULED','ON_AIR')`), which
is always true rather than merely usually true. It also removes the need for
compensating logic when a slot is cancelled — nothing has to be un-set on the
episode.

`ARCHIVED` was added because business rule 13 asks for archiving instead of
deletion, and an archived episode is a content state, not a broadcast state.

### 2.2 `qc_reviews` is append-only

**Specified:** a `qc_reviews` table, shape unstated.

**Implemented:** an immutable ledger. One row per decision, no UPDATE or DELETE
policy for any role, and no client INSERT policy either — rows appear only via
`approve_episode()` / `reject_episode()`.

**Why:** business rule 12 asks for traceable state transitions. A mutable
"current review" row would be overwritten on resubmission, destroying exactly
the history that matters: *what was wrong the first time, and did it get fixed?*
The episode detail page shows the full chain, and the seed data includes a real
rejection comment so the shape is visible immediately.

### 2.3 The circular audio reference was resolved, not implemented literally

**Specified:** `episodes.audio_file_id` **and** `audio_files.episode_id` — a
circular foreign key.

**Implemented:** the two columns keep different jobs.

- `audio_files.episode_id` — **ownership**. `NOT NULL`, `ON DELETE CASCADE`.
- `episodes.audio_file_id` — **the current take**. Nullable,
  `ON DELETE SET NULL`, validated by `app.validate_episode_audio_pointer()`
  which refuses a pointer to audio belonging to a different episode.

**Why:** a literal circular FK needs deferred constraints and makes insert order
painful. This version has a natural order (episode → audio → repoint), supports
"replace the take" without losing the previous file, and cannot drift: the
trigger makes a mismatched pointer unstorable.

### 2.4 `broadcast_state` is an enforced singleton

**Specified:** a `broadcast_state` entity.

**Implemented:** one row, guaranteed. `id boolean primary key check (id)` means
a second row is impossible, and a CHECK constraint keeps `ON_AIR` and `OFFLINE`
internally consistent (`ON_AIR` must have both a schedule and a start time).

**Why:** most of "what is on air" is derivable from `schedules`, so the table
earns its place only by answering what the schedule cannot: *did a human
actually go live?* A slot scheduled for 18:00 is not proof the station is
transmitting. That single fact — plus who flipped the switch and when — is the
whole justification for the table, and it is small enough to stay honest.

### 2.5 Smaller renames

- `default_duration` → `default_duration_minutes`. The original name does not
  say whether it is seconds or minutes, and every caller would have to guess.
- `programs.requires_audio` was added. Business rule 4 says audio is needed
  "if audio is required" — that condition has to live somewhere, and the
  programme is the right level: a pre-recorded feature always needs a file, a
  live request show never does.
- `episodes.assigned_rj` was added. "RJ can access assigned radio content"
  cannot be enforced without a column expressing the assignment; `host_name` is
  free text and cannot be matched to an account.

## 3. Why these RPCs and not more

`SECURITY DEFINER` functions were written only where an operation must be atomic
or must bypass the content freeze:

| Function | Why it cannot be plain CRUD |
| --- | --- |
| `submit_episode_for_qc` | Validates audio, flips status, timestamps, logs — one transaction |
| `approve_episode` / `reject_episode` | Ledger row + status + timestamp + log must all land together |
| `reopen_episode` | Must check no live slot depends on the episode first |
| `archive_episode` | Same dependency check |
| `schedule_episode` | Five validations plus a human-readable clash message |
| `cancel_schedule` | Cancelling the live slot must also take the station off air |
| `start_broadcast` / `end_broadcast` | Schedule status and station state must move together |
| `sync_broadcast_state` | Bulk close of expired slots |

Everything else — creating a programme, editing a draft, uploading audio
metadata, changing a slot's time — is plain CRUD guarded by RLS and constraints.
Wrapping those in RPCs would add indirection without adding correctness.

### The status-change guard

Guard triggers reject *any* status change unless the transaction sets
`app.workflow = on`, which only the RPCs (and `seed.sql`) do. This is what makes
the workflow the single door:

```sql
update public.episodes set status = 'APPROVED' where id = ...;
-- ERROR: Episode status cannot be set directly. Use submit_episode_for_qc /
--        approve_episode / reject_episode / reopen_episode / archive_episode.
```

It holds for admins too. There is a test for it.

## 4. Time

Everything is `timestamptz`, stored in UTC, displayed in Asia/Kolkata.

India has no daylight saving, so the offset is a constant `+05:30`. That turns
day-boundary maths into something exact rather than approximate:
`stationDayRange('2026-09-09')` builds `2026-09-09T00:00:00+05:30` directly
instead of guessing with local browser time. `src/utils/datetime.ts` is the only
place that formats or parses time, so the station timezone is defined once.

## 5. Failure handling in uploads

Storage and the database are two systems, and a naive upload can desynchronise
them. `audioService.uploadAudio` orders the work so that every failure is
recoverable:

1. Validate the file (type, size) client-side — the bucket and a CHECK
   constraint validate again server-side.
2. Upload the object.
3. Insert the metadata row. **On failure, delete the object.**
4. Point the episode at it. **On failure, delete the row and the object.**

The result: no metadata row ever describes a file that is not there, and no file
sits in the bucket without a row. The one remaining case — the cleanup delete
itself fails — logs a warning in development and leaves an unreferenced object,
which is the harmless direction to fail in.

## 6. What was deliberately left out

- **No playout automation.** The brief said not to build one. `broadcast_state`
  records human decisions; nothing here talks to an encoder.
- **No realtime subscriptions.** A station schedule changes a few times a day. A
  Refresh button is honest and costs nothing to maintain.
- **No query cache library.** `useAsync` is 40 lines and covers every screen.
- **No admin user-creation UI.** Creating an auth user needs the service-role
  key, which must never reach the browser. Accounts are created in the Supabase
  dashboard; the Users page manages roles and activation, which is what actually
  changes often.
- **No settings table.** Frequency, campus and timezone are facts about the
  licence, not preferences. They are displayed, not stored in a table nobody
  would edit.
- **No soft-delete columns.** Programmes deactivate, episodes archive, schedules
  cancel. Each already has a domain-meaningful state; a generic `deleted_at`
  would duplicate it.

## 7. What the live run found

The suite runs against PGlite, which is real PostgreSQL but *only* PostgreSQL.
Running the app against a live Supabase project surfaced two defects that no
amount of database testing could have reached, and both are worth recording
because they are the shape of bug this architecture is prone to.

**1. Seeded accounts could not log in.** `POST /auth/v1/token` returned
`500 Database error querying schema`. GoTrue reads `auth.users` columns that
nothing in this project writes -- `confirmation_token`, `recovery_token`,
`phone_change` and friends -- into non-nullable Go strings, so the `NULL`s left
by a hand-written `INSERT` broke the scan. The test shim models the columns
*our* code touches, so it could never have seen this. `seed.sql` now normalises
those columns to `''`, checking `information_schema` per column so it survives
GoTrue schema changes rather than hard-coding a list.

**2. `storage.objects` is not ours to alter.** On a hosted project that table
belongs to `supabase_storage_admin`, and a bare
`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` fails for `postgres` -- taking the
whole migration with it. In the shim we own the table, so it passed. Migration
05 now enables RLS only when it is actually off and treats a privilege refusal
as "Supabase already manages this".

A third bug came out of driving the UI rather than the database: reopening the
schedule form kept the previous slot's times, so re-entering identical values
changed no React state, the conflict effect never re-ran, and a stale (empty)
conflict list left the form looking clear while the database was certain to
reject it. Fixed by resetting the form on open and making the effect depend on
the form being open. Worth noting *what* the bug was: the advisory UI check went
wrong, and nothing bad happened, because the `EXCLUDE` constraint refused the
write anyway. That is the layering working as designed.

The general lesson: PGlite proves the rules; only a live project proves the
plumbing. After any change to auth, storage, or the seed, re-run the live checks
listed in the README.

## 8. Known limits
- The production bundle is ~525 kB (~150 kB gzipped), mostly `supabase-js`. For
  an internal tool on campus wifi this is fine; if it matters, route-level
  `React.lazy` splitting is the first step.
- `sync_broadcast_state()` runs when a dashboard loads. If nobody opens the CMS
  for a week, slots stay `SCHEDULED` until someone does. A scheduled job would
  fix that, and is deliberately not built until the station wants it.
