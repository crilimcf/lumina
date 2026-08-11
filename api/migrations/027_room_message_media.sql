ALTER TABLE room_messages
  ALTER COLUMN body DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS media_mime TEXT;

ALTER TABLE room_messages
  DROP CONSTRAINT IF EXISTS room_messages_content_check;

ALTER TABLE room_messages
  ADD CONSTRAINT room_messages_content_check
  CHECK (
    NULLIF(btrim(COALESCE(body, '')), '') IS NOT NULL
    OR media_url IS NOT NULL
  );

ALTER TABLE uploads
  DROP CONSTRAINT IF EXISTS uploads_purpose_check;

ALTER TABLE uploads
  ADD CONSTRAINT uploads_purpose_check
  CHECK (purpose IS NULL OR purpose IN ('legacy','post','moment','message','avatar','room','room_message'));
