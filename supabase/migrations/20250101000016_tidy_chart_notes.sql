-- =============================================================================
-- 16. Take the production notes off the published chart
--
-- Three chart rows carried notes written for whoever was transcribing the
-- printed Fixed Point Chart rather than for a listener reading the site:
--
--   "Alternating strands, as printed on the chart."          (two rows)
--   "Sits inside Rebroadcast - II. Printed on the chart as
--    \"1700 Hrs - The Campus Quiz, Can you answer this?\""
--
-- They explain how the chart was copied, which is of no interest to somebody
-- checking what is on at five o'clock. The remaining notes stay, because they
-- tell a listener something real -- which programmes fill the rotating block,
-- and that the afternoon is a repeat of the morning.
--
-- Cleared here rather than edited into migration 10, which has already been
-- applied: the seed still writes them and this removes them, so a fresh
-- project and the live one end up in the same place.
-- =============================================================================

update public.station_slots
   set notes = null
 where notes is not null
   and (
     notes like 'Alternating strands%'
     or notes like 'Sits inside Rebroadcast%'
   );
