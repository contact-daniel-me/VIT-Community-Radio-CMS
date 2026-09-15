-- 20260914000001_gamification.sql
CREATE TYPE badge_rarity AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY');

CREATE TABLE gamification_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    badge_key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    requirement TEXT NOT NULL,
    icon TEXT NOT NULL,
    rarity badge_rarity NOT NULL,
    xp INTEGER NOT NULL,
    threshold INTEGER NOT NULL,
    metric TEXT NOT NULL,
    almost_threshold INTEGER,
    active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE gamification_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level INTEGER UNIQUE NOT NULL,
    title TEXT NOT NULL,
    min_xp INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE gamification_xp_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    xp_reward INTEGER NOT NULL,
    active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE user_gamification_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    admin_id UUID NOT NULL REFERENCES profiles(id),
    xp_adjustment INTEGER DEFAULT 0 NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Insert initial Badge Definitions
INSERT INTO gamification_badges (badge_key, name, description, requirement, icon, rarity, xp, threshold, metric, almost_threshold) VALUES
('mic-drop', 'Mic Drop', 'You stepped up to the mic for the first time.', 'Create your first show', 'mic', 'COMMON', 50, 1, 'episodeCount', NULL),
('slot-locked', 'Slot Locked', 'You claimed your place in the broadcast schedule.', 'Book your first studio slot', 'clock', 'COMMON', 50, 1, 'bookingCount', NULL),
('sound-check', 'Sound Check', 'Your audio is in the system. Ready to roll.', 'Upload your first audio file', 'waveform', 'COMMON', 75, 1, 'audioUploadCount', NULL),
('scripted', 'Scripted', 'Your show is ready for review.', 'Submit an episode for QC', 'script', 'COMMON', 50, 1, 'submittedCount', NULL),
('green-light', 'Green Light', 'Quality checked and broadcast-ready.', 'Get your first episode approved', 'signal', 'UNCOMMON', 100, 1, 'approvedCount', NULL),
('tuned-in', 'Tuned In', 'Five shows deep and still broadcasting.', 'Create 5 episodes', 'tuner', 'UNCOMMON', 100, 5, 'episodeCount', 4),
('first-broadcast', 'First Broadcast', 'Your voice hit the airwaves.', 'Have an episode scheduled for broadcast', 'onair', 'UNCOMMON', 100, 1, 'scheduledCount', NULL),
('voice-rising', 'Voice Rising', 'Your quality is consistently broadcast-ready.', 'Get 5 episodes approved', 'rising', 'UNCOMMON', 150, 5, 'approvedCount', 4),
('first-frequency', 'First Frequency', 'Double digits. You found your frequency.', 'Create 10 episodes', 'frequency', 'RARE', 150, 10, 'episodeCount', 8),
('on-a-roll', 'On A Roll', 'Three approved shows this month — you''re on fire.', 'Get 3 episodes approved in one month', 'fire', 'RARE', 150, 3, 'monthlyApproved', 2),
('frequency-familiar', 'Frequency Familiar', 'The studio knows your name.', 'Book 10 studio slots', 'clock', 'RARE', 150, 10, 'bookingCount', 8),
('request-line', 'Request Line', 'You keep submitting and the station keeps listening.', 'Submit 5 episodes for QC', 'signal', 'RARE', 200, 5, 'submittedCount', 4),
('station-voice', 'Station Voice', 'Fifteen episodes. You''re part of the station now.', 'Create 15 episodes', 'mic', 'RARE', 200, 15, 'episodeCount', 13),
('campus-shout', 'Campus Shout', 'Twenty shows — VIT Community Radio is louder because of you.', 'Create 20 episodes', 'broadcast', 'EPIC', 200, 20, 'episodeCount', 18),
('frequency-hunter', 'Frequency Hunter', 'Ten approved episodes. You hunt the perfect signal.', 'Get 10 episodes approved', 'frequency', 'EPIC', 250, 10, 'approvedCount', 8),
('locked-to-the-frequency', 'Locked To The Frequency', 'Twenty bookings. The studio slot is basically yours.', 'Book 20 studio slots', 'lock', 'EPIC', 200, 20, 'bookingCount', 18),
('voice-of-vit', 'Voice Of VIT', 'Twenty-five shows. You ARE the voice of VIT.', 'Create 25 episodes', 'mic', 'EPIC', 250, 25, 'episodeCount', 23),
('radio-devotion', 'Radio Devotion', 'Thirty bookings. This isn''t a hobby — it''s a calling.', 'Book 30 studio slots', 'broadcast', 'LEGENDARY', 300, 30, 'bookingCount', 27),
('radio-legend', 'Radio Legend', 'Fifty episodes. Your legacy is woven into VIT Community Radio.', 'Create 50 episodes', 'legend', 'LEGENDARY', 500, 50, 'episodeCount', 45)
ON CONFLICT (badge_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  requirement = EXCLUDED.requirement,
  icon = EXCLUDED.icon,
  rarity = EXCLUDED.rarity,
  xp = EXCLUDED.xp,
  threshold = EXCLUDED.threshold,
  metric = EXCLUDED.metric,
  almost_threshold = EXCLUDED.almost_threshold;

-- Insert Levels
INSERT INTO gamification_levels (level, title, min_xp) VALUES
(1, 'Radio Newcomer', 0),
(2, 'Signal Seeker', 100),
(3, 'Frequency Finder', 250),
(4, 'Radio Regular', 500),
(5, 'Rising Voice', 850),
(6, 'Broadcast Veteran', 1300),
(7, 'Station Pillar', 1900),
(8, 'Radio Legend', 2700)
ON CONFLICT (level) DO UPDATE SET
  title = EXCLUDED.title,
  min_xp = EXCLUDED.min_xp;

-- Insert XP Rules (based on leaderboardService.ts)
INSERT INTO gamification_xp_rules (action, description, xp_reward) VALUES
('EPISODE_CREATE', 'Create a new show', 10),
('EPISODE_QC_SUBMIT', 'Submit show for QC', 5),
('EPISODE_QC_APPROVE', 'Show is approved', 25),
('STUDIO_BOOKING', 'Book a studio slot', 15)
ON CONFLICT (action) DO UPDATE SET
  description = EXCLUDED.description,
  xp_reward = EXCLUDED.xp_reward;

-- RLS
ALTER TABLE gamification_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE gamification_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE gamification_xp_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_gamification_adjustments ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public read badges" ON gamification_badges FOR SELECT USING (true);
CREATE POLICY "Admin write badges" ON gamification_badges FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN')
);

CREATE POLICY "Public read levels" ON gamification_levels FOR SELECT USING (true);
CREATE POLICY "Admin write levels" ON gamification_levels FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN')
);

CREATE POLICY "Public read xp rules" ON gamification_xp_rules FOR SELECT USING (true);
CREATE POLICY "Admin write xp rules" ON gamification_xp_rules FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN')
);

CREATE POLICY "Public read own adjustments" ON user_gamification_adjustments FOR SELECT USING (
  user_id = auth.uid()
);
CREATE POLICY "Admin read all adjustments" ON user_gamification_adjustments FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN')
);
CREATE POLICY "Admin write adjustments" ON user_gamification_adjustments FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN')
);

-- Realtime replication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE gamification_badges, gamification_levels, gamification_xp_rules;
  END IF;
END $$;
