# VIT Community Radio CMS

Internal content management system for **VIT Community Radio, 90.8 FM, VIT Vellore**.

The station team uses it to manage programmes and episodes, upload audio, run a
QC review workflow, build the broadcast schedule, and record what is on air.

---

## Contents

- [Overview](#overview)
- [Technology stack](#technology-stack)
- [Architecture](#architecture)
- [Database schema](#database-schema)
- [Roles](#roles)
- [Authentication](#authentication)
- [Row Level Security](#row-level-security)
- [Storage](#storage)
- [QC workflow](#qc-workflow)
- [Scheduling workflow](#scheduling-workflow)
- [Broadcast workflow](#broadcast-workflow)
- [Activity log](#activity-log)
- [Environment variables](#environment-variables)
- [Local development](#local-development)
- [Supabase setup](#supabase-setup)
- [Migrations](#migrations)
- [Seed data](#seed-data)
- [Testing](#testing)
- [Project structure](#project-structure)

---

## Overview

One end-to-end path defines the system:

```
sign in → create programme → create episode → upload MP3 → submit for QC
        → QC approves → schedule the episode → go on air
        → system reports CURRENT and NEXT → broadcast completes → activity logged
```

Every step of that path is enforced in PostgreSQL. The React app is a client of
those rules, not the place they live.

This is a CMS, not a playout system. It records what *should* go to air and what
*did*; it does not stream audio or drive an encoder.

## Technology stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19, TypeScript, Vite |
| Routing | react-router-dom |
| Backend | Supabase (PostgreSQL 17, PostgREST, GoTrue, Storage) |
| Auth | Supabase Auth (email + password) |
| Files | Supabase Storage, private `radio-audio` bucket |
| Styling | One plain CSS file, no UI framework |
| Tests | Vitest + PGlite (real PostgreSQL in-process) |

No state library, no component library, no ORM. Dependencies were added only
where they replace code that would otherwise have to be written and maintained.

## Architecture

```
React pages / components        presentation only, no queries
        │
hooks/  (useAuth, useAsync)     React state glue
        │
services/                       ALL data access, typed, throws AppError
        │
lib/supabase.ts                 one client, anon key only
        │  HTTPS + JWT
┌───────┴──────────────────────────────────────────┐
│ SUPABASE                                         │
│   PostgREST ──► PostgreSQL                       │
│      • RLS policies          ← authorisation     │
│      • CHECK / FK / EXCLUDE  ← data integrity    │
│      • guard triggers        ← state machines    │
│      • SECURITY DEFINER RPC  ← atomic workflows  │
│   Storage (radio-audio, private, RLS)            │
│   Auth (JWT)                                     │
└──────────────────────────────────────────────────┘
```

Two rules hold the design together:

1. **No SQL in components.** Pages call services; services own the queries.
2. **The browser is never trusted.** Hiding a button is a convenience. Anyone
   with a valid JWT and `curl` is stopped by the database, and the test suite
   proves it.

## Database schema

Eight tables, UUID primary keys, `timestamptz` everywhere.

```
auth.users ──1:1── profiles
                      │ created_by / assigned_rj / reviewer_id / uploaded_by
                      ▼
 programs ──1:N── episodes ──1:N── audio_files
     │                │  ▲                │
     │                │  └── audio_file_id (current take, nullable)
     │                └──1:N── qc_reviews (append-only)
     │
     └──1:N── schedules ──N:1── episodes (nullable = live show)
                   │
                   └──1:1── broadcast_state.current_schedule_id

 activity_logs (user_id, action, entity_type, entity_id, metadata jsonb)
```

| Table | Purpose |
| --- | --- |
| `profiles` | One row per auth user. Holds `role` and `active`. |
| `programs` | A radio show. Deactivated, never deleted. |
| `episodes` | One instalment. Holds the **content** lifecycle only. |
| `audio_files` | Storage metadata. No binary data in PostgreSQL. |
| `qc_reviews` | Append-only ledger of every QC decision. |
| `schedules` | Broadcast slots. Holds the **broadcast** lifecycle. |
| `broadcast_state` | Enforced single row: is the station live right now. |
| `activity_logs` | Business-level audit trail. |

### Three design decisions worth knowing

**Content status and broadcast status are separate.** `episodes.status` is
`DRAFT → PENDING_QC → APPROVED | REJECTED` (plus `ARCHIVED`). `SCHEDULED`,
`ON_AIR` and `COMPLETED` are *not* episode states — they belong to `schedules`,
because one approved episode can be scheduled many times (reruns). "Is this
episode scheduled?" is a join, not a column.

**`qc_reviews` is a ledger.** Every approve/reject appends a row and nothing
ever updates or deletes one — there is no such policy for any role. A
resubmitted episode accumulates history rather than overwriting it.

**`broadcast_state` answers what the schedule cannot.** A slot being scheduled
for 18:00 does not mean anyone actually went live. The singleton row records the
operator's action, and its CHECK constraint makes an inconsistent state
(`ON_AIR` with no schedule) impossible to store.

Notable constraints:

- `schedules_no_overlap` — an `EXCLUDE USING gist` constraint. One station, one
  channel, so two slots can never overlap, even if two admins save at the same
  instant. Application-level checking cannot guarantee that.
- `qc_reviews_rejection_needs_comment` — a rejection must carry at least five
  characters of explanation.
- `broadcast_state_consistent` — `ON_AIR` requires both a schedule and a start
  time; `OFFLINE` requires neither.
- Unique `lower(btrim(name))` on programmes, unique `(program_id, episode_number)`.

## Roles

| | ADMIN | PRODUCER | RJ | QC |
| --- | :-: | :-: | :-: | :-: |
| Read everything | ✓ | ✓ | ✓ | ✓ |
| Create / edit programmes | ✓ | ✓ | | |
| Create episodes | ✓ | ✓ | ✓ | |
| Edit episodes | any editable | any editable | own / assigned | |
| Upload, replace, delete audio | ✓ | ✓ | own / assigned | |
| Submit for QC | ✓ | ✓ | own / assigned | |
| Approve / reject | ✓ | | | ✓ |
| Create / cancel schedules | ✓ | ✓ | | |
| Go on air / end broadcast | ✓ | ✓ | ✓ | |
| Manage users | ✓ | | | |

"Editable" means status `DRAFT` or `REJECTED`. Once an episode is `PENDING_QC`
or `APPROVED`, **nobody** — including an admin — can edit it through normal CRUD;
QC must review exactly what was submitted. Reopening it is an explicit, logged
action (`reopen_episode`).

## Authentication

Supabase Auth with email and password. Sessions persist in the browser and
refresh automatically.

- A trigger on `auth.users` creates the matching `profiles` row.
- The role comes from `raw_app_meta_data`, which only the service-role key can
  write. `raw_user_meta_data` is supplied by the user at signup and is **never**
  trusted for a role — otherwise anyone could sign up as an admin. There is a
  test for exactly this.
- Self-service signup is disabled in `supabase/config.toml`. An administrator
  creates accounts.
- Deactivating a profile (`active = false`) cuts off access immediately: the
  role helper returns `NULL`, and every policy fails.

## Row Level Security

RLS is enabled on all eight tables plus `storage.objects`. `anon` has no grants
and no policies — every table returns *permission denied*.

Policies are built on three `SECURITY DEFINER` helpers:

| Helper | Answers |
| --- | --- |
| `app.current_role()` | The caller's role, or NULL if signed out or deactivated |
| `app.has_role(...)` | Is the caller one of these roles |
| `app.can_edit_episode(id)` | May the caller modify this episode *right now* |

They are `SECURITY DEFINER` for a specific reason: a policy on `profiles` that
reads `profiles` to learn the caller's role causes infinite policy recursion. A
definer function reads it with RLS bypassed, which is the standard fix.

`FORCE ROW LEVEL SECURITY` is deliberately **not** used. Tables are owned by
`postgres`, and the workflow functions run as that owner; forcing RLS would
apply policies to the owner and break them. Clients connect as `anon` or
`authenticated` and never as the owner.

Three tables have no client write policy at all — `qc_reviews`,
`broadcast_state` and `activity_logs`. They change only through
`SECURITY DEFINER` functions, so the QC ledger and the audit trail cannot be
forged or erased from a browser.

Two behaviours worth understanding when reading the code:

- An UPDATE whose `USING` clause fails **silently affects zero rows** — RLS
  filters, it does not raise. The service layer detects that with `RETURNING`
  and turns it into a clear permission message (`assertWritten`).
- `DELETE` is never granted on `programs`, `episodes` or `schedules`, so a
  delete attempt fails outright. Deactivate, archive or cancel instead.

## Storage

Private bucket `radio-audio`, 200 MB limit, **MP3 only** (`audio/mpeg`, plus the
`audio/mp3` alias some browsers send).

```
radio-audio/
  episodes/
    {episode_id}/
      {timestamp}-{filename}.mp3
```

Storage policies parse `{episode_id}` out of the object path and reuse
`app.can_edit_episode()` — the same rule as the table layer. A path that does
not match `episodes/{uuid}/...` yields NULL and fails closed. Reading is open to
any signed-in station member, because QC must be able to play what it reviews.
Playback always uses a short-lived signed URL; there is no public URL.

**Upload never leaves broken records.** `audioService.uploadAudio` writes the
object first, then the metadata row, then the episode pointer, and unwinds each
step if the next one fails. A failed upload leaves neither an orphaned row nor
an orphaned file.

## QC workflow

```
DRAFT ──submit_episode_for_qc()──► PENDING_QC ──approve_episode()──► APPROVED
  ▲                                     │
  │                                     └──reject_episode(comment)──► REJECTED
  │                                                                      │
  └──────────────── reopen_episode() ◄─── edit ◄─────────────────────────┘
```

- Submitting requires audio when the programme has `requires_audio` (live shows
  can turn it off).
- Rejection requires a comment — enforced by the RPC *and* by a CHECK constraint.
- Only `QC` and `ADMIN` can approve or reject.
- Approved-but-scheduled episodes cannot be reopened until the slot is cancelled,
  otherwise the schedule would point at unreviewed content.
- Status can only move through these functions. A direct
  `update episodes set status = 'APPROVED'` is rejected by a guard trigger even
  for an admin.

## Scheduling workflow

`schedule_episode(program, episode, start, end, notes)` validates, in one
transaction:

1. The episode belongs to that programme.
2. The episode is `APPROVED` (business rule 5, enforced in the backend).
3. The programme is active (no new slots for retired shows).
4. Audio exists, if the programme requires it.
5. The slot does not overlap any non-cancelled slot.

Times are stored in UTC and displayed in **Asia/Kolkata**. India has no daylight
saving, so day boundaries are computed with a fixed `+05:30` offset, which makes
"today's schedule" exact rather than approximate.

Slots are cancelled (`cancel_schedule`), never deleted.

## Broadcast workflow

```
SCHEDULED ──start_broadcast()──► ON_AIR ──end_broadcast()──► COMPLETED
     └────────────── cancel_schedule() ──────────► CANCELLED
```

- `start_broadcast` refuses if the station is already on air on another slot.
- `end_broadcast` completes the slot and returns the station to `OFFLINE`.
- A `COMPLETED` or `CANCELLED` slot can never go back on air.
- `sync_broadcast_state()` is housekeeping called when a dashboard loads: it
  closes slots whose end time has passed so the CMS never claims something
  finished hours ago is still live. It touches no encoder.

The Live page answers: on air or offline, which programme, which episode, the
host, when it started, when it ends, and what is next.

## Activity log

Business actions only — never every query. Logging happens **in the database**
(triggers plus explicit calls inside the workflow functions), so a client cannot
skip it.

Recorded: programme created/updated/(de)activated, episode created/updated,
audio uploaded/deleted, submitted for QC, approved, rejected, reopened,
archived, schedule created/updated/cancelled, broadcast started/ended, user role
changed, user (de)activated.

Admins and producers see the whole trail; everyone else sees only their own
entries.

## Environment variables

Copy `.env.example` to `.env.local`:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

These two are the only values the frontend may ever hold. **The service-role key
must never appear anywhere under `src/`** — it bypasses RLS entirely. Anything
needing it belongs in a server-side script or an Edge Function.

## Local development

```bash
npm install
cp .env.example .env.local     # then fill in the two values
npm run dev                    # http://localhost:5173
```

Other scripts:

```bash
npm run build        # typecheck + production build
npm run typecheck    # tsc only
npm run lint         # eslint
npm test             # backend test suite (see Testing)
```

## Supabase setup

**Option A — local stack (needs Docker):**

```bash
npx supabase start          # boots PostgreSQL, Auth, Storage, Studio
npx supabase db reset       # applies migrations, then seed.sql
```

`supabase start` prints the API URL and anon key for `.env.local`.

**Option B — hosted project, no CLI (paste one file):**

There are two generated bundles in `supabase/deploy/`, and they are **not**
interchangeable. Pick by what the project already has:

| Project state | File | Contents |
| --- | --- | --- |
| Empty, nothing applied | `fresh_project_setup.sql` | every migration + the development seed |
| Already has migrations 01–07 | `full_setup.sql` | migrations 08–12 only |

Copy the right one into the SQL Editor and press Run. Running the fresh bundle
against a project that already has 01–07 fails on the first `create type`;
running the upgrade against an empty project fails because migration 08
references tables that 01 creates.

Both are produced by `npm run build:bundle`, which copies the migration SQL
verbatim, and both are covered by `tests/specs/04-deploy-bundle.spec.ts` — the
upgrade bundle is applied on top of a database holding exactly 01–07, which is
what proves the 08–12 dependency order.

**Option C — hosted project with the CLI:**

1. Create a project at supabase.com.
2. `npx supabase link --project-ref <ref>`
3. `npx supabase db push` to apply the migrations.
4. Copy the URL and anon key from Settings → API into `.env.local`.
5. Create the first administrator in Authentication → Add user, then set their
   role. Because a user cannot promote themselves, do it once with the SQL
   editor:

   ```sql
   update public.profiles set role = 'ADMIN' where email = 'you@vit.ac.in';
   ```

   After that, admins manage roles from the Users page.

The migrations create the `radio-audio` bucket and its policies, so no manual
storage configuration is needed.

## Migrations

Applied in filename order:

| File | Contents |
| --- | --- |
| `20250101000001_core_schema.sql` | Enums, tables, constraints, indexes |
| `20250101000002_helpers_and_triggers.sql` | Role helpers, guard triggers, audit triggers |
| `20250101000003_workflow_functions.sql` | QC / schedule / broadcast RPCs and read views |
| `20250101000004_rls_policies.sql` | Grants and every RLS policy |
| `20250101000005_storage.sql` | Bucket and storage policies |

```bash
npx supabase migration new <name>   # create a new one
npx supabase db push                # apply to the linked project
npx supabase db reset               # rebuild locally, then seed
```

## Seed data

`supabase/seed.sql` is **development data only** and every record says so.
It creates five accounts (password `radio-dev-2025`):

| Email | Role |
| --- | --- |
| `admin@vitradio.dev` | ADMIN |
| `producer@vitradio.dev` | PRODUCER |
| `rj.sneha@vitradio.dev` | RJ |
| `rj.karthik@vitradio.dev` | RJ |
| `qc@vitradio.dev` | QC |

Plus five programmes (one deliberately inactive), nine episodes covering every
content state, QC history including a real rejection comment, and a schedule
with a completed slot, a slot covering *now*, an upcoming slot and a live show
with no episode.

Audio rows point at storage paths that hold no file — the seed contains no
binary blobs, so seeded playback 404s until something real is uploaded.

```bash
npx supabase db reset            # migrations + seed
psql "$DATABASE_URL" -f supabase/seed.sql   # seed only
```

Never run it against production.

## Testing

The backend is tested against **PGlite** — real PostgreSQL 17 compiled to
WebAssembly, running in-process — so no Docker is required. The suite applies
the actual files from `supabase/migrations/`, with a small shim
(`tests/harness/bootstrap.sql`) standing in for the `auth` and `storage` schemas
that GoTrue and storage-api normally provide. Impersonation works exactly as
PostgREST does it: `SET ROLE authenticated` plus a `request.jwt.claims` GUC that
`auth.uid()` reads.

```bash
npm test
```

**75 tests, five files:**

| File | Covers |
| --- | --- |
| `00-schema.spec.ts` | Tables, RLS enabled, singleton, constraints, overlap, audio pointer, signup-metadata escalation |
| `01-workflow.spec.ts` | The whole success path plus reject → edit → resubmit → approve, content freeze, current/next broadcast, completion, audit trail |
| `02-authorization.spec.ts` | Every role against every table, anon lockout, ledger immutability, privilege escalation, deactivation cut-off |
| `03-storage-and-seed.spec.ts` | Storage policies (path forgery, cross-user writes, lock on submission) and the seed |
| `04-deploy-bundle.spec.ts` | The generated one-shot setup file applies as a single batch and seeds fully |

What this cannot cover is anything outside PostgreSQL: PostgREST request
shaping, GoTrue password login, and real uploads through the storage API. Those
were verified by hand against a live Supabase project, and doing so found two
bugs the suite could never have caught -- see `docs/ARCHITECTURE.md`, "What the
live run found". Re-check them after any change to auth, storage or the seed.

## Project structure

```
src/
  components/     presentational pieces (badges, banners, audio player)
  pages/          one file per screen
  layouts/        app shell and navigation
  services/       all data access, one file per domain
  hooks/          useAuth, useAsync
  lib/            supabase client, error translation, permissions
  types/          database types
  utils/          IST date/time formatting
supabase/
  migrations/     schema, triggers, functions, RLS, storage
  seed.sql        development data
  config.toml     CLI configuration
tests/
  harness/        PGlite bootstrap and helpers
  specs/          backend test suite
docs/
  ARCHITECTURE.md design decisions and rationale
```

Services never import from `pages/` or `components/`; components never import
`supabase` directly.
