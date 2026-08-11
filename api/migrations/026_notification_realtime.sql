-- Lumina · notificações/unread em tempo real.
-- A base de dados é a fonte de verdade: qualquer criação, leitura ou remoção de
-- uma notificação acorda o stream SSE do respetivo utilizador, independentemente
-- da instância Railway que executou a alteração.

CREATE OR REPLACE FUNCTION lumina_emit_notification_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_user UUID;
  notification_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_user := OLD.user_id;
    notification_id := OLD.id;
  ELSE
    target_user := NEW.user_id;
    notification_id := NEW.id;
  END IF;

  PERFORM pg_notify(
    'lumina_realtime_v1',
    json_build_object(
      'id', gen_random_uuid()::text,
      'userIds', json_build_array(target_user::text),
      'type', 'notification_changed',
      'at', clock_timestamp(),
      'notificationId', notification_id::text
    )::text
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS notifications_realtime_change ON notifications;
CREATE TRIGGER notifications_realtime_change
AFTER INSERT OR DELETE OR UPDATE OF read_at ON notifications
FOR EACH ROW
EXECUTE FUNCTION lumina_emit_notification_change();
