-- Lumina · chamadas: telemetria mínima de entrega para distinguir
-- push aceite, dispositivo efetivamente acordado e chamada atendida.

ALTER TABLE call_sessions
  ADD COLUMN IF NOT EXISTS push_attempted INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS push_accepted INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS push_last_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS callee_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS call_sessions_callee_ringing_idx
  ON call_sessions(callee_id, created_at DESC)
  WHERE status='ringing';
