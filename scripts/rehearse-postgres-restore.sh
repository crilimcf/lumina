#!/usr/bin/env bash
# Rehearse a Lumina PostgreSQL custom-format backup in a disposable, offline
# PostgreSQL container. NEVER connects to Railway or modifies production.
set -euo pipefail
umask 077

if [[ $# -ne 1 || ! -f "${1:-}" ]]; then
  echo "Usage: bash scripts/rehearse-postgres-restore.sh /path/to/lumina-backup.dump" >&2
  exit 2
fi

backup="$1"
command -v docker >/dev/null || { echo "Docker is required." >&2; exit 2; }
if [[ "$(head -c 5 "$backup")" != "PGDMP" ]]; then
  echo "Not a PostgreSQL custom-format (PGDMP) archive. No restore attempted." >&2
  exit 2
fi

container="lumina-recovery-check-${RANDOM}-$$"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# Isolate the restored personal data from the network and the production database.
# No published ports, no persistent volumes, no production credentials.
docker run --detach --rm --network none \
  --name "$container" \
  -e POSTGRES_PASSWORD=isolated-local-restore-only \
  postgres:18 >/dev/null

# pg_isready can briefly succeed against the temporary bootstrap server, which
# the official Postgres image shuts down before starting the final server.
# Wait for init completion *and* a ready connection to the final server.
ready=0
for _ in {1..90}; do
  if docker logs "$container" 2>&1 | grep -Fq 'PostgreSQL init process complete; ready for start up.' \
     && docker exec "$container" pg_isready --username postgres --dbname postgres >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" != "1" ]]; then
  echo "Offline PostgreSQL instance did not become ready." >&2
  exit 1
fi

# Verify the archive's table of contents before running any restore.
docker exec -i "$container" pg_restore --list < "$backup" >/dev/null
docker exec "$container" createdb --username postgres lumina_restore
docker exec -i "$container" pg_restore \
  --username postgres --dbname lumina_restore \
  --no-owner --no-privileges --exit-on-error < "$backup"

# Verify key social tables exist, without displaying data from users or messages.
docker exec "$container" psql --username postgres --dbname lumina_restore \
  --no-psqlrc --set ON_ERROR_STOP=1 --tuples-only --no-align \
  --command "SELECT CASE WHEN
    to_regclass('public.users') IS NOT NULL
    AND to_regclass('public.posts') IS NOT NULL
    AND to_regclass('public.creator_plans') IS NOT NULL
    THEN 'RESTORE_OK' ELSE 'RESTORE_FAILED' END;" |
    grep -qx 'RESTORE_OK'

echo "RESTORE_OK: custom-format backup restored to isolated PostgreSQL 18; required tables verified."
echo "The disposable database will be deleted. Production is unchanged."
