-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- STUDIO BOOKING REQUESTS
-- =============================================================================

create type public.booking_request_status as enum (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED'
);

create table public.studio_booking_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete restrict,
  booking_date date not null,
  start_time time not null,
  end_time time not null,
  language public.show_language not null,
  script_status public.script_approval not null,
  script_approver uuid references public.profiles(id) on delete restrict,
  self_edit boolean not null,
  editor_id uuid references public.profiles(id) on delete restrict,
  notes text,
  status public.booking_request_status not null default 'PENDING',
  rejection_reason text,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Protect against duplicate pending requests for the same slot
create unique index idx_studio_booking_requests_duplicate_pending
  on public.studio_booking_requests (user_id, booking_date, start_time)
  where status = 'PENDING';

-- RLS
alter table public.studio_booking_requests enable row level security;

-- RJ can view their own requests
create policy "Users can view their own booking requests"
  on public.studio_booking_requests for select
  using (user_id = auth.uid());

-- Admin/Producer can view all requests
create policy "Station staff can view all booking requests"
  on public.studio_booking_requests for select
  using (app.current_role() in ('ADMIN', 'PRODUCER'));

-- RJ can insert their own requests
create policy "Users can insert their own booking requests"
  on public.studio_booking_requests for insert
  with check (
    user_id = auth.uid()
    and status = 'PENDING'
  );

-- RJ can update their own pending requests (to cancel them)
create policy "Users can cancel their own pending requests"
  on public.studio_booking_requests for update
  using (
    user_id = auth.uid()
    and status = 'PENDING'
  )
  with check (
    status = 'CANCELLED'
  );

-- Admin/Producer can update any request
create policy "Station staff can manage booking requests"
  on public.studio_booking_requests for update
  using (app.current_role() in ('ADMIN', 'PRODUCER'));
