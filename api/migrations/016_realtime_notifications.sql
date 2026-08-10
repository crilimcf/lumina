-- Lumina · mensagens/chamadas: notificações coerentes com o estado real.

CREATE OR REPLACE FUNCTION lumina_notify_direct_message()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  recipient uuid;
  key text;
BEGIN
  SELECT CASE WHEN t.user_a = NEW.sender_id THEN t.user_b ELSE t.user_a END
    INTO recipient
    FROM threads t
   WHERE t.id = NEW.thread_id;

  IF recipient IS NULL THEN RETURN NEW; END IF;
  key := 'message:' || recipient::text || ':' || NEW.thread_id::text || ':' || NEW.sender_id::text;

  INSERT INTO notifications (user_id, type, actor_id, data, dedupe_key)
  VALUES (
    recipient,
    'message',
    NEW.sender_id,
    jsonb_build_object(
      'threadId', NEW.thread_id,
      'messageId', NEW.id,
      'kind', NEW.kind,
      'mode', NEW.mode,
      'mediaType', NEW.media_type
    ),
    key
  )
  ON CONFLICT (dedupe_key) DO UPDATE
    SET actor_id = EXCLUDED.actor_id,
        data = EXCLUDED.data,
        read_at = NULL,
        created_at = now();

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lumina_notify_direct_message ON messages;
CREATE TRIGGER trg_lumina_notify_direct_message
AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION lumina_notify_direct_message();

CREATE OR REPLACE FUNCTION lumina_read_direct_message_notification()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  recipient uuid;
BEGIN
  IF NEW.read_at IS NULL OR OLD.read_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT CASE WHEN t.user_a = NEW.sender_id THEN t.user_b ELSE t.user_a END
    INTO recipient
    FROM threads t
   WHERE t.id = NEW.thread_id;

  UPDATE notifications
     SET read_at = COALESCE(read_at, NEW.read_at)
   WHERE user_id = recipient
     AND type = 'message'
     AND actor_id = NEW.sender_id
     AND data->>'threadId' = NEW.thread_id::text
     AND read_at IS NULL;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lumina_read_direct_message_notification ON messages;
CREATE TRIGGER trg_lumina_read_direct_message_notification
AFTER UPDATE OF read_at ON messages
FOR EACH ROW EXECUTE FUNCTION lumina_read_direct_message_notification();

CREATE OR REPLACE FUNCTION lumina_notify_incoming_call()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO notifications (user_id, type, actor_id, data, dedupe_key)
  VALUES (
    NEW.callee_id,
    'incoming_call',
    NEW.caller_id,
    jsonb_build_object('callId', NEW.id, 'threadId', NEW.thread_id, 'mode', NEW.mode),
    'call:' || NEW.id::text || ':' || NEW.callee_id::text
  )
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lumina_notify_incoming_call ON call_sessions;
CREATE TRIGGER trg_lumina_notify_incoming_call
AFTER INSERT ON call_sessions
FOR EACH ROW EXECUTE FUNCTION lumina_notify_incoming_call();

CREATE OR REPLACE FUNCTION lumina_finish_incoming_call_notification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('active','declined','ended') AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE notifications
       SET read_at = COALESCE(read_at, now()),
           data = data || jsonb_build_object('callStatus', NEW.status)
     WHERE user_id = NEW.callee_id
       AND type = 'incoming_call'
       AND data->>'callId' = NEW.id::text;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lumina_finish_incoming_call_notification ON call_sessions;
CREATE TRIGGER trg_lumina_finish_incoming_call_notification
AFTER UPDATE OF status ON call_sessions
FOR EACH ROW EXECUTE FUNCTION lumina_finish_incoming_call_notification();
