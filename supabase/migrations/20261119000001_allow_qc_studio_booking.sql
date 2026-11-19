-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- ALLOW QC ROLE TO BOOK STUDIO
--
-- Enables users with the QC role to book studio recording slots, just like RJs
-- and Producers, while preserving all existing permissions, booking workflows,
-- and UI design.
-- =============================================================================

-- Update RLS policy on public.studio_bookings to allow QC role to insert bookings for themselves
drop policy if exists "bookings_insert" on public.studio_bookings;

create policy "bookings_insert"
  on public.studio_bookings for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      app.has_role('ADMIN')
      or (
        app.has_role('RJ', 'PRODUCER', 'QC')
        and rj_id = auth.uid()
        and origin = 'RJ'
      )
    )
  );

comment on policy "bookings_insert" on public.studio_bookings is
  'Allows administrators, producers, radio jockeys, and quality control (QC) users to book studio recording slots for themselves.';
