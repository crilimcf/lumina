ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_messages_delivery_pending
  ON messages (sender_id, delivered_at)
  WHERE delivered_at IS NULL;
