-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- FEEDBACK & IDEAS HUB
--
-- Adds support for user feedback and ideas, supporting both Identified submissions
-- and strictly Anonymous submissions where no user identity is ever linked.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Reference sequence for human-readable IDs (e.g. FB-2026-0042)
-- -----------------------------------------------------------------------------
create sequence if not exists public.feedback_reference_seq start 101;

-- -----------------------------------------------------------------------------
-- Main Feedback Submissions table
-- -----------------------------------------------------------------------------
create table if not exists public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  feedback_type text not null check (feedback_type in ('IDENTIFIED', 'ANONYMOUS')),
  user_id uuid references public.profiles(id) on delete set null,
  category text not null check (category in ('IDEA', 'BUG', 'STUDIO', 'BOOKING', 'TECHNICAL', 'APPRECIATION', 'OTHER')),
  subject text not null check (char_length(trim(subject)) >= 3 and char_length(subject) <= 150),
  message text not null check (char_length(trim(message)) >= 10 and char_length(message) <= 3000),
  rating integer check (rating is null or (rating >= 1 and rating <= 5)),
  status text not null default 'NEW' check (status in ('NEW', 'IN_REVIEW', 'RESOLVED', 'ARCHIVED')),
  admin_response text,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,

  -- Strict database-level anonymity guarantee:
  -- Anonymous feedback CANNOT have a user_id stored.
  -- Identified feedback MUST have a user_id stored.
  constraint feedback_anonymous_identity_guard check (
    (feedback_type = 'ANONYMOUS' and user_id is null) or
    (feedback_type = 'IDENTIFIED' and user_id is not null)
  )
);

create index if not exists feedback_submissions_status_idx on public.feedback_submissions (status);
create index if not exists feedback_submissions_category_idx on public.feedback_submissions (category);
create index if not exists feedback_submissions_type_idx on public.feedback_submissions (feedback_type);
create index if not exists feedback_submissions_user_idx on public.feedback_submissions (user_id);
create index if not exists feedback_submissions_created_idx on public.feedback_submissions (created_at desc);

-- -----------------------------------------------------------------------------
-- Internal admin notes table for audit trail and threaded notes
-- -----------------------------------------------------------------------------
create table if not exists public.feedback_admin_notes (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.feedback_submissions(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  note text not null check (char_length(trim(note)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists feedback_admin_notes_feedback_idx on public.feedback_admin_notes (feedback_id, created_at asc);

-- -----------------------------------------------------------------------------
-- Trigger: Generate human-friendly reference ID if not provided
-- -----------------------------------------------------------------------------
create or replace function app.set_feedback_reference()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.reference is null or trim(new.reference) = '' then
    new.reference := 'FB-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.feedback_reference_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists feedback_reference_trigger on public.feedback_submissions;
create trigger feedback_reference_trigger
  before insert on public.feedback_submissions
  for each row execute function app.set_feedback_reference();

-- -----------------------------------------------------------------------------
-- Trigger: Set updated_at on modification
-- -----------------------------------------------------------------------------
drop trigger if exists feedback_updated_at_trigger on public.feedback_submissions;
create trigger feedback_updated_at_trigger
  before update on public.feedback_submissions
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Secure view for submitters (My Feedback)
-- Does not contain internal admin notes, only submitter's own identified feedback
-- -----------------------------------------------------------------------------
create or replace view public.v_my_feedback as
  select
    id,
    reference,
    feedback_type,
    user_id,
    category,
    subject,
    message,
    rating,
    status,
    admin_response,
    created_at,
    updated_at,
    resolved_at
  from public.feedback_submissions
  where user_id = auth.uid() and feedback_type = 'IDENTIFIED';

comment on view public.v_my_feedback is
  'Submitters own identified feedback rows, excluding internal admin notes.';

-- -----------------------------------------------------------------------------
-- Row Level Security (RLS) Policies
-- -----------------------------------------------------------------------------
alter table public.feedback_submissions enable row level security;
alter table public.feedback_admin_notes enable row level security;

-- Insert Policy: Authenticated users can submit feedback.
-- If ANONYMOUS, user_id must be null. If IDENTIFIED, user_id must match auth.uid().
drop policy if exists "feedback_insert_authenticated" on public.feedback_submissions;
create policy "feedback_insert_authenticated"
  on public.feedback_submissions for insert to authenticated
  with check (
    (feedback_type = 'ANONYMOUS' and user_id is null) or
    (feedback_type = 'IDENTIFIED' and user_id = auth.uid())
  );

-- Select Policy: Admins can see all feedback.
drop policy if exists "feedback_select_admin" on public.feedback_submissions;
create policy "feedback_select_admin"
  on public.feedback_submissions for select to authenticated
  using (app.is_admin());

-- Select Policy: Regular users can only see their own identified feedback.
drop policy if exists "feedback_select_own_identified" on public.feedback_submissions;
create policy "feedback_select_own_identified"
  on public.feedback_submissions for select to authenticated
  using (user_id = auth.uid() and feedback_type = 'IDENTIFIED');

-- Update Policy: Only administrators can update feedback (status, admin_response, admin_notes, etc.)
drop policy if exists "feedback_update_admin" on public.feedback_submissions;
create policy "feedback_update_admin"
  on public.feedback_submissions for update to authenticated
  using (app.is_admin())
  with check (app.is_admin());

-- Delete Policy: Only administrators can delete feedback
drop policy if exists "feedback_delete_admin" on public.feedback_submissions;
create policy "feedback_delete_admin"
  on public.feedback_submissions for delete to authenticated
  using (app.is_admin());

-- Admin Notes Policies: Only administrators can insert, read, or manage internal notes
drop policy if exists "feedback_notes_admin_all" on public.feedback_admin_notes;
create policy "feedback_notes_admin_all"
  on public.feedback_admin_notes for all to authenticated
  using (app.is_admin())
  with check (app.is_admin());

-- Grants
grant select, insert on public.feedback_submissions to authenticated;
grant update, delete on public.feedback_submissions to authenticated;
grant all on public.feedback_admin_notes to authenticated;
grant select on public.v_my_feedback to authenticated;
grant usage on sequence public.feedback_reference_seq to authenticated;
