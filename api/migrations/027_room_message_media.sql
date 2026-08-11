ALTER TABLE room_messages
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS media_mime TEXT;

ALTER TABLE room_messages
  DROP CONSTRAINT IF EXISTS room_messages_content_check;

ALTER TABLE room_messages
  ADD CONSTRAINT room_messages_content_check
  CHECK (
    (NULLIF(btrim(body), '') IS NOT NULL)
    OR media_url IS NOT NULL
  );
