-- Lumina · videochamadas de grupo
-- Usa Salas privadas como grupo persistente e mantém a sinalização multipessoa
-- separada das chamadas 1:1 para não alterar contratos existentes.

CREATE TABLE group_call_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  initiator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode         TEXT NOT NULL DEFAULT 'video' CHECK (mode = 'video'),
  status       TEXT NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing','active','ended')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at   TIMESTAMPTZ,
  ended_at     TIMESTAMPTZ
);
CREATE INDEX group_call_sessions_room_status_idx
  ON group_call_sessions(room_id, status, created_at DESC);

CREATE TABLE group_call_participants (
  call_id      UUID NOT NULL REFERENCES group_call_sessions(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','joined','declined','left')),
  invited_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_at      TIMESTAMPTZ,
  joined_at    TIMESTAMPTZ,
  left_at      TIMESTAMPTZ,
  PRIMARY KEY (call_id, user_id)
);
CREATE INDEX group_call_participants_user_status_idx
  ON group_call_participants(user_id, status, invited_at DESC);

CREATE TABLE group_call_signals (
  id           BIGSERIAL PRIMARY KEY,
  call_id      UUID NOT NULL REFERENCES group_call_sessions(id) ON DELETE CASCADE,
  sender_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('offer','answer','ice','hangup')),
  payload      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX group_call_signals_recipient_idx
  ON group_call_signals(call_id, recipient_id, id);
