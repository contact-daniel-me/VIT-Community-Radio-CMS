-- 20260914000003_user_badges.sql
CREATE TABLE user_badges (
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    badge_key TEXT NOT NULL,
    earned_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (user_id, badge_key)
);

ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own user_badges" ON user_badges FOR SELECT USING (
    user_id = auth.uid()
);

CREATE POLICY "Admin read all user_badges" ON user_badges FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN')
);

CREATE POLICY "Users insert own user_badges" ON user_badges FOR INSERT WITH CHECK (
    user_id = auth.uid()
);

-- Insert the 'first-signal' badge definition if it doesn't already exist
INSERT INTO gamification_badges (badge_key, name, description, requirement, icon, rarity, xp, threshold, metric)
VALUES ('first-signal', 'First Signal', 'Welcome to VIT Community Radio! You signed in for the first time.', 'Sign in to the CMS', 'zap', 'COMMON', 25, 1, 'signInCount')
ON CONFLICT (badge_key) DO NOTHING;

-- Realtime replication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE user_badges;
  END IF;
END $$;
