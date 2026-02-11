-- PIN認証用のapp_settingsテーブル作成
CREATE TABLE IF NOT EXISTS app_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- デフォルトPIN設定
INSERT INTO app_settings (key, value) VALUES ('general_pin', '1234')
ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('admin_pin', '9999')
ON CONFLICT (key) DO NOTHING;

-- RLSポリシー設定
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read for anon" ON app_settings;
CREATE POLICY "Allow read for anon" ON app_settings
FOR SELECT USING (true);

-- group_membersにplayer_idカラムを追加（players テーブルと結合用）
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS player_id uuid REFERENCES players(id);

-- scoresテーブルにplayer_idのユニーク制約を追加（player_id版のupsert用）
-- 既存のuser_id制約は残す（後方互換性のため）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scores_event_player_hole_unique'
  ) THEN
    ALTER TABLE scores ADD CONSTRAINT scores_event_player_hole_unique
    UNIQUE (event_id, player_id, hole_number);
  END IF;
END $$;
