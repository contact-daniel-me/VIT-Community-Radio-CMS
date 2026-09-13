-- =============================================================================
-- Station Announcements
-- =============================================================================

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  status text not null check (status in ('DRAFT', 'PUBLISHED', 'SCHEDULED', 'ARCHIVED')),
  published_at timestamptz,
  scheduled_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  created_by uuid references auth.users not null
);

-- RLS
alter table public.announcements enable row level security;

-- Everyone can read announcements (the application filters out drafts/future ones)
create policy "Announcements are readable by everyone"
  on public.announcements for select
  using (true);

-- Only admins and producers can manage announcements
create policy "Announcements are editable by station staff"
  on public.announcements for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role in ('ADMIN', 'PRODUCER')
    )
  );

-- Helper trigger for updated_at
create or replace function update_announcements_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_announcements_updated_at
  before update on public.announcements
  for each row
  execute function update_announcements_updated_at();
