ALTER TABLE room_messages
  ADD COLUMN private_recipient_id UUID REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE room_messages
  ADD CONSTRAINT room_messages_private_recipient_not_sender
  CHECK (private_recipient_id IS NULL OR private_recipient_id <> sender_id);

CREATE INDEX room_messages_private_recipient_idx
  ON room_messages(room_id, private_recipient_id, created_at)
  WHERE private_recipient_id IS NOT NULL;
