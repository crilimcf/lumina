#!/usr/bin/env bash
#
# Arranque da Lumina.
#
#   bash arrancar.sh
#
# Faz o que dá para fazer por comando: verifica o que tens instalado, instala
# as dependências, cria o repositório no GitHub e prepara os ficheiros de
# configuração. O Railway e a Vercel ficam a faltar — a primeira ligação é
# feita no site deles e não há volta a dar.

set -e
cd "$(dirname "$0")"

azul()    { printf '\033[1;34m%s\033[0m\n' "$*"; }
verde()   { printf '\033[1;32m%s\033[0m\n' "$*"; }
amarelo() { printf '\033[1;33m%s\033[0m\n' "$*"; }
vermelho(){ printf '\033[1;31m%s\033[0m\n' "$*"; }

echo
azul "═══ Lumina · arranque ═══"
echo

# ─────────────────────────── 1. o que falta instalar

falta=0
verificar() {
  if command -v "$1" >/dev/null 2>&1; then
    verde "  ✓ $1  $($2 2>/dev/null | head -1)"
  else
    vermelho "  ✗ $1 em falta — $3"
    falta=1
  fi
}

azul "1 · A verificar o que tens instalado"
verificar node "node --version" "instala em nodejs.org (versão LTS)"
verificar npm  "npm --version"  "vem com o Node"
verificar git  "git --version"  "instala em git-scm.com"

if command -v node >/dev/null 2>&1; then
  major=$(node --version | sed 's/v\([0-9]*\).*/\1/')
  if [ "$major" -lt 20 ]; then
    vermelho "  ✗ Precisas do Node 20 ou superior. Tens a versão $major."
    falta=1
  fi
fi

if command -v gh >/dev/null 2>&1; then
  verde "  ✓ gh  (GitHub CLI — dá para criar o repositório por comando)"
  TEM_GH=1
else
  amarelo "  ○ gh em falta — sem ele, crias o repositório à mão no site"
  TEM_GH=0
fi

[ "$falta" = "1" ] && { echo; vermelho "Instala o que falta e volta a correr isto."; exit 1; }

# ─────────────────────────── 2. dependências

echo
azul "2 · A instalar dependências (demora um minuto)"
(cd api && npm install --silent) && verde "  ✓ api"
(cd web && npm install --silent) && verde "  ✓ web"

# ─────────────────────────── 3. configuração

echo
azul "3 · Ficheiros de configuração"

if [ ! -f api/.env ]; then
  cp api/.env.example api/.env
  # Um segredo forte, gerado agora. O do exemplo nunca deve ir para lado nenhum.
  if command -v openssl >/dev/null 2>&1; then
    SEGREDO=$(openssl rand -base64 48 | tr -d '\n')
  else
    SEGREDO=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64'))")
  fi
  # sed do macOS e do Linux não são iguais
  if sed --version >/dev/null 2>&1; then
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$SEGREDO|" api/.env
  else
    sed -i '' "s|^JWT_SECRET=.*|JWT_SECRET=$SEGREDO|" api/.env
  fi
  verde "  ✓ api/.env criado, com um JWT_SECRET novo"
  amarelo "    Falta meteres o DATABASE_URL (passo 5)"
else
  verde "  ✓ api/.env já existia — não lhe toquei"
fi

[ -f web/.env ] || { cp web/.env.example web/.env; verde "  ✓ web/.env criado"; }

# ─────────────────────────── 4. git e GitHub

echo
azul "4 · Git"

if [ ! -d .git ]; then
  git init -q
  git add -A
  git -c user.email="${GIT_EMAIL:-tu@exemplo.pt}" \
      -c user.name="${GIT_NAME:-Lumina}" \
      commit -qm "Lumina: primeira versão"
  verde "  ✓ repositório local criado"
else
  verde "  ✓ já era um repositório git"
fi

if [ "$TEM_GH" = "1" ] && ! git remote get-url origin >/dev/null 2>&1; then
  echo
  read -p "  Criar o repositório no GitHub agora? [s/N] " -n 1 -r resposta
  echo
  if [[ $resposta =~ ^[Ss]$ ]]; then
    read -p "  Nome do repositório [lumina]: " NOME
    NOME=${NOME:-lumina}
    # Privado de propósito: o .env fica de fora pelo .gitignore, mas um
    # repositório público de arranque é um convite a enganos.
    gh repo create "$NOME" --private --source=. --push && verde "  ✓ no GitHub, privado"
  fi
fi

# ─────────────────────────── 5. o que falta

echo
azul "═══ Feito. O que falta ═══"
echo
cat <<'FIM'
  5 · Base de dados
      railway.app → New Project → Provision PostgreSQL
      Copia o DATABASE_URL e mete-o em api/.env
      Mete também PGSSL=true

  6 · Arrancar (dois terminais)
      cd api && npm run seed && npm run dev
      cd web && npm run dev
      Abre http://localhost:5173

  7 · Pôr no ar
      Railway  → Deploy from GitHub repo, Root Directory = api
      Vercel   → Import Project, Root Directory = web
      Ver README.md para as variáveis de ambiente

  Contas do seed, todas com a password: lumina1234
      sofia@exemplo.pt · joao@exemplo.pt · ana@exemplo.pt · nuno@exemplo.pt
FIM
echo
