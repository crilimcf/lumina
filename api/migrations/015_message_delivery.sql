ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS media_type text;

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_media_type_check;
ALTER TABLE messages
  ADD CONSTRAINT messages_media_type_check
  CHECK (media_type IS NULL OR media_type IN ('image','video'));

UPDATE messages
   SET media_type = 'image'
 WHERE kind = 'media' AND media_url IS NOT NULL AND media_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_delivery_pending
  ON messages (sender_id, delivered_at)
  WHERE delivered_at IS NULL;
