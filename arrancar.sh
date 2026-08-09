#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

say() { printf '\n\033[1;35m%s\033[0m\n' "$1"; }
need() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'Falta o comando obrigatório: %s\n' "$1" >&2
    exit 1
  }
}

need node
need npm
need git

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Lumina requer Node.js 20 ou superior. Atual: $(node -v)" >&2
  exit 1
fi

say "Lumina · preparação local"
echo "Node: $(node -v)"
echo "npm:  $(npm -v)"

for app in api web; do
  if [ ! -f "$app/.env" ] && [ -f "$app/.env.example" ]; then
    cp "$app/.env.example" "$app/.env"
    echo "Criado $app/.env a partir do exemplo."
  fi
done

say "A instalar dependências da API"
(
  cd api
  npm ci
)

say "A instalar dependências da Web"
(
  cd web
  npm ci
)

cat <<'EOF'

Preparação concluída.

1. Revê api/.env e web/.env antes de arrancar.
2. Com PostgreSQL disponível, aplica as migrations:

   cd api
   npm run migrate

3. Arranca a API:

   cd api
   npm run dev

4. Noutro terminal, arranca a Web:

   cd web
   npm run dev

Opcional, apenas para um ambiente local descartável:

   cd api
   npm run seed

Não uses o seed nem o reset de produção numa base de dados real sem seguir
docs/OPERATIONS.md.
EOF
