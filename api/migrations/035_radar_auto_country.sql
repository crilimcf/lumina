-- Lumina · Radar follows the current physical country.
--
-- Schema 35 intentionally performs no content/catalog rewrites during process startup.
-- Railway waits for /health before promoting a release, so country source preparation is
-- executed idempotently only after the HTTP server is listening (radar-scheduler.js).
-- The country-aware read path is backward compatible with pre-35 items.

SELECT 1;
