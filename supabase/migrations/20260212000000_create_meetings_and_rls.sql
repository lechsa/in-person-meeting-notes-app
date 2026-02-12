-- ============================================
-- Meetings table
-- ============================================
CREATE TABLE IF NOT EXISTS meetings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    audio_url   TEXT,
    transcript  TEXT,
    summary     TEXT,
    status      TEXT NOT NULL DEFAULT 'recording'
                CHECK (status IN ('recording', 'uploading', 'processing', 'completed', 'failed')),
    duration    INTEGER,        -- seconds
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for user's meetings list query
CREATE INDEX IF NOT EXISTS idx_meetings_user_id_created ON meetings(user_id, created_at DESC);

-- ============================================
-- Row-Level Security — meetings
-- ============================================
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own meetings"
    ON meetings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own meetings"
    ON meetings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meetings"
    ON meetings FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can update meetings"
    ON meetings FOR UPDATE
    USING (auth.role() = 'service_role');

-- ============================================
-- Storage bucket for audio files
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('meeting-audio', 'meeting-audio', false)
ON CONFLICT (id) DO NOTHING;

-- Users can upload to their own folder
CREATE POLICY "Users can upload own audio"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'meeting-audio'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Users can read their own audio
CREATE POLICY "Users can read own audio"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'meeting-audio'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
