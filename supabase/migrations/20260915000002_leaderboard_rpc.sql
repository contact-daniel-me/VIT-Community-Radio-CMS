-- 20260915000002_leaderboard_rpc.sql

CREATE OR REPLACE FUNCTION public.get_leaderboard_data()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  res json;
BEGIN
  SELECT json_build_object(
    'profiles', (SELECT COALESCE(json_agg(row_to_json(p)), '[]'::json) FROM (SELECT id, full_name FROM profiles WHERE active = true AND role != 'ADMIN') p),
    'episodes', (SELECT COALESCE(json_agg(row_to_json(e)), '[]'::json) FROM (SELECT id, created_by, status, submitted_at, created_at, reviewed_at, audio_file_id FROM episodes WHERE created_by IS NOT NULL) e),
    'bookings', (SELECT COALESCE(json_agg(row_to_json(b)), '[]'::json) FROM (SELECT id, rj_id, created_at FROM studio_bookings WHERE status != 'CANCELLED' AND rj_id IS NOT NULL) b),
    'schedules', (SELECT COALESCE(json_agg(row_to_json(s)), '[]'::json) FROM (SELECT id, created_by FROM schedules WHERE created_by IS NOT NULL) s),
    'user_badges', (SELECT COALESCE(json_agg(row_to_json(ub)), '[]'::json) FROM (SELECT user_id, badge_key, earned_at FROM user_badges) ub),
    'xp_rules', (SELECT COALESCE(json_agg(row_to_json(xr)), '[]'::json) FROM (SELECT action, xp_reward FROM gamification_xp_rules WHERE active = true) xr),
    'adjustments', (SELECT COALESCE(json_agg(row_to_json(a)), '[]'::json) FROM (SELECT user_id, xp_adjustment, created_at FROM user_gamification_adjustments) a)
  ) INTO res;
  
  RETURN res;
END;
$$;
