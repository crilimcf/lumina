-- Feed editavel, promoções separadas, salas e chamadas.

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'post',
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE posts ADD CONSTRAINT posts_kind_check CHECK (kind IN ('post', 'promotion'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE comments ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- Salas passam a ser um consumidor válido do lifecycle de uploads.
ALTER TABLE uploads DROP CONSTRAINT IF EXISTS uploads_purpose_check;
ALTER TABLE uploads ADD CONSTRAINT uploads_purpose_check
  CHECK (purpose IS NULL OR purpose IN ('legacy','post','moment','message','avatar','room'));

CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  topic VARCHAR(180) NOT NULL,
  description VARCHAR(1000) NOT NULL DEFAULT '',
  image_url TEXT,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private', 'ultra')),
  create_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (create_price_cents >= 0),
  entry_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (entry_price_cents >= 0),
  billing_state TEXT NOT NULL DEFAULT 'active' CHECK (billing_state IN ('active', 'pending_payment', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_members (
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_entry_at TIMESTAMPTZ,
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS room_invites (
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS room_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body VARCHAR(4000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS room_messages_room_created_idx ON room_messages(room_id, created_at);
CREATE INDEX IF NOT EXISTS room_invites_user_idx ON room_invites(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS room_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('create', 'entry')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_ref TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS room_payments_paid_once_idx
  ON room_payments(room_id, user_id, kind)
  WHERE status = 'paid';

CREATE TABLE IF NOT EXISTS call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  caller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  callee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('audio', 'video')),
  status TEXT NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'active', 'ended', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS call_sessions_callee_status_idx ON call_sessions(callee_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS call_signals (
  id BIGSERIAL PRIMARY KEY,
  call_id UUID NOT NULL REFERENCES call_sessions(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('offer', 'answer', 'ice', 'hangup')),
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS call_signals_call_id_idx ON call_signals(call_id, id);
