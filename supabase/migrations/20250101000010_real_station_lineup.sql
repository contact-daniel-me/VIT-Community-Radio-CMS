-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 10 THE REAL STATION LINE-UP
--
-- The actual programmes and Fixed Point Chart for VIT Community Radio 90.8,
-- transcribed from the published chart "W.E.F 25th August 2026".
--
-- This is a DATA migration, not a schema one, and it carries real operational
-- data rather than the development samples in seed.sql. It is idempotent:
--   * programmes conflict on the existing unique lower(btrim(name)) index
--   * the chart inserts only if no chart for that effective date is present
-- so running it twice changes nothing.
--
-- Programme names are transcribed exactly as printed on the chart, including
-- "Vallunar Paarvai" -- if the intended spelling is "Valluvar Paarvai", rename
-- it in the CMS rather than editing this file.
-- =============================================================================

-- Attribute the rows to an administrator if one exists; NULL is acceptable and
-- simply means "created during setup".
create temporary table if not exists _setup_actor as
select id from public.profiles where role = 'ADMIN' order by created_at limit 1;

-- -----------------------------------------------------------------------------
-- Programmes. Durations reflect the chart: the morning strands are five-minute
-- segments, the rotating talk programmes share the 09:30-11:59 window.
-- -----------------------------------------------------------------------------
insert into public.programs (name, description, category, default_duration_minutes, requires_audio, active, created_by)
select v.name, v.description, v.category, v.minutes, true, true, (select id from _setup_actor)
from (values
  -- Morning band, 09:05 - 09:30
  ('Vanakkam Vellore',        'Morning welcome for Vellore and the VIT campus.',                    'CAMPUS',       5),
  ('Andru Indru',             'Then and now: a look back at the day in history.',                   'HISTORY',      5),
  ('Dhinam Oru Thiravukool',  'A key idea a day.',                                                  'KNOWLEDGE',    5),
  ('Manvaasanai',             'The scent of the soil: folk and rural life.',                        'CULTURE',      5),
  ('Dhinam Oru Velan Seithi', 'A daily bulletin for the farming community.',                        'AGRICULTURE',  5),
  ('Sevichelvam',             'The wealth of listening.',                                           'CULTURE',      5),
  ('Data Chunks',             'Short data and technology briefings.',                               'TECHNOLOGY',   5),

  -- Rotating block, 09:30 - 11:59
  ('Anubava Medai',           'The experience stage: people on what they have lived through.',      'TALK',        30),
  ('Arivom Aayiram',          'A thousand things worth knowing.',                                   'KNOWLEDGE',   30),
  ('Exchange of Ideas',       'Conversation across disciplines and departments.',                   'TALK',        30),
  ('Experts Talk',            'Specialists in conversation on their field.',                        'TALK',        30),
  ('Kaarasaram',              'Sharp, opinionated discussion.',                                     'TALK',        30),
  ('Karuthukalam',            'An open forum for opinion and debate.',                              'TALK',        30),
  ('Maruthuva Neram',         'The medical hour: health advice and discussion.',                    'HEALTH',      30),
  ('Noble Lectures',          'Lectures worth hearing, from campus and beyond.',                    'EDUCATION',   30),
  ('Pallikoodam',             'School: learning, teaching and the classroom.',                      'EDUCATION',   30),
  ('Second Look',             'A closer second look at what deserves it.',                          'REVIEW',      30),
  ('Thiraikadaloodi',         'Across the seas: literature, cinema and journeys.',                  'LITERATURE',  30),
  ('Travel Bonanza',          'Places, journeys and the people met along the way.',                 'TRAVEL',      30),
  ('VIT Achievers',           'The students and staff of VIT, and what they have achieved.',        'CAMPUS',      30),
  ('Vallunar Paarvai',        'A Valluvar-eyed view of everyday life.',                             'LITERATURE',  30),
  ('Special Talks',           'One-off talks that do not fit a regular strand.',                    'TALK',        30),
  ('Special Shows',           'Festival, occasion and outside-broadcast specials.',                 'SPECIAL',     30),
  ('Chatty Chatty',           'Light, unhurried campus conversation.',                              'TALK',        30),

  -- Afternoon feature
  ('The Campus Quiz',         'Can you answer this? The daily campus quiz.',                        'QUIZ',        30)
) as v(name, description, category, minutes)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- The Fixed Point Chart itself, effective 25 August 2026, Monday to Friday.
--
-- Two slots carry no programme link on purpose: the chart prints them as a pair
-- of alternating strands ("Vanakkam Vellore / Andru Indru"), and the chart text
-- is the authority on what actually goes out.
-- -----------------------------------------------------------------------------
insert into public.station_slots
  (title, kind, start_time, end_time, days, program_id, notes, effective_from, created_by)
select
  v.title,
  v.kind::public.slot_kind,
  v.start_time::time,
  v.end_time::time,
  '{1,2,3,4,5}'::smallint[],
  (select p.id from public.programs p where lower(btrim(p.name)) = lower(v.program_name)),
  v.notes,
  date '2026-08-25',
  (select id from _setup_actor)
from (values
  ('Signature Tune & Radio Anthem',           'ANNOUNCEMENT',   '09:00', '09:05', '',                         null),
  ('Vanakkam Vellore / Andru Indru',          'SEGMENT',        '09:05', '09:10', '',                         'Alternating strands, as printed on the chart.'),
  ('Dhinam Oru Thiravukool',                  'SEGMENT',        '09:10', '09:15', 'Dhinam Oru Thiravukool',   null),
  ('Manvaasanai / Dhinam Oru Velan Seithi',   'SEGMENT',        '09:15', '09:20', '',                         'Alternating strands, as printed on the chart.'),
  ('Sevichelvam',                             'SEGMENT',        '09:20', '09:25', 'Sevichelvam',              null),
  ('Data Chunks',                             'SEGMENT',        '09:25', '09:30', 'Data Chunks',              null),
  ('Rotating programmes',                     'ROTATING_BLOCK', '09:30', '11:59', '',                         'Filled from the rotating pool: Anubava Medai, Arivom Aayiram, Exchange of Ideas, Experts Talk, Kaarasaram, Karuthukalam, Maruthuva Neram, Noble Lectures, Pallikoodam, Second Look, Thiraikadaloodi, Travel Bonanza, VIT Achievers, Vallunar Paarvai, Special Talks, Special Shows, Chatty Chatty.'),
  ('Closing Announcement (Morning)',           'ANNOUNCEMENT',   '11:59', '12:00', '',                        null),
  ('Rebroadcast - I',                          'REBROADCAST',    '12:00', '14:59', '',                        'Repeat of the morning band.'),
  ('Closing Announcement (Afternoon)',         'ANNOUNCEMENT',   '14:59', '15:00', '',                        null),
  ('Rebroadcast - II',                         'REBROADCAST',    '15:00', '18:00', '',                        'Second repeat of the morning band.'),
  ('The Campus Quiz',                          'FEATURE',        '17:00', '17:30', 'The Campus Quiz',         'Sits inside Rebroadcast - II. Printed on the chart as "1700 Hrs - The Campus Quiz, Can you answer this?"'),
  ('Closing Announcement (Evening)',           'ANNOUNCEMENT',   '18:00', '18:05', '',                        'Close of the broadcast day.')
) as v(title, kind, start_time, end_time, program_name, notes)
where not exists (
  select 1 from public.station_slots where effective_from = date '2026-08-25'
);

drop table if exists _setup_actor;
