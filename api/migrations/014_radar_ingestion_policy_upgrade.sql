-- Lumina · Radar ingestion policy upgrade
-- Migration 013 may already be applied in production; keep it immutable and evolve here.

-- Repair any RSS rows whose status changed while an older application instance was still running.
UPDATE radar_items
SET ingestion_trusted = true,
    ingestion_publishable = true
WHERE fingerprint LIKE 'rss:%'
  AND status = 'published'
  AND (ingestion_trusted IS DISTINCT FROM true OR ingestion_publishable IS DISTINCT FROM true);

UPDATE radar_items
SET ingestion_publishable = false
WHERE fingerprint LIKE 'rss:%'
  AND status = 'draft'
  AND ingestion_publishable IS DISTINCT FROM false;

CREATE OR REPLACE FUNCTION radar_fill_ingestion_policy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_trusted boolean := false;
  source_auto_publish boolean := false;
BEGIN
  IF NEW.fingerprint LIKE 'rss:%' THEN
    IF TG_OP = 'UPDATE' THEN
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status = 'published' THEN
          NEW.ingestion_trusted := true;
          NEW.ingestion_publishable := true;
        ELSIF NEW.status = 'draft' THEN
          NEW.ingestion_publishable := false;
        END IF;
        -- Ao arquivar preserva-se a classe anterior para bloquear siblings futuros.
      END IF;
    END IF;

    IF NEW.ingestion_trusted IS NULL OR NEW.ingestion_publishable IS NULL THEN
      SELECT rs.trusted,
             (rs.config->'autoPublish' IS DISTINCT FROM 'false'::jsonb)
        INTO source_trusted, source_auto_publish
        FROM radar_sources rs
       WHERE rs.id = NEW.source_id;

      IF NEW.ingestion_trusted IS NULL THEN
        NEW.ingestion_trusted := CASE
          WHEN NEW.status = 'published' THEN true
          ELSE COALESCE(source_trusted, false)
        END;
      END IF;

      IF NEW.ingestion_publishable IS NULL THEN
        NEW.ingestion_publishable := CASE
          WHEN NEW.status = 'published' THEN true
          WHEN NEW.status = 'draft' THEN false
          ELSE COALESCE(source_trusted, false) AND COALESCE(source_auto_publish, false)
        END;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS radar_reconcile_ingestion_policy_before_status_update ON radar_items;
CREATE TRIGGER radar_reconcile_ingestion_policy_before_status_update
BEFORE UPDATE OF status ON radar_items
FOR EACH ROW
EXECUTE FUNCTION radar_fill_ingestion_policy();
