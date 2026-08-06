-- Lumina · esquema inicial
-- Postgres 14+

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ─────────────────────────── utilizadores

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handle        CITEXT UNIQUE NOT NULL CHECK (handle ~ '^[a-z0-9._]{3,24}$'),
  email         CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  bio           TEXT DEFAULT '',
  palette       SMALLINT NOT NULL DEFAULT 0 CHECK (palette BETWEEN 0 AND 4),
  stars         TEXT[] NOT NULL DEFAULT '{}',
  is_staff      BOOLEAN NOT NULL DEFAULT false,
  suspended_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- pesquisa por estrela (interesses)
CREATE INDEX users_stars_idx ON users USING GIN (stars);

CREATE TABLE follows (
  follower_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
CREATE INDEX follows_following_idx ON follows(following_id);

-- ─────────────────────────── comunidades

CREATE TABLE communities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        CITEXT UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9-]{2,32}$'),
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  -- fuso IANA escolhido por quem funda. O dia vira à meia-noite local.
  timezone    TEXT NOT NULL DEFAULT 'Europe/Lisbon',
  founder_id  UUID NOT NULL REFERENCES users(id),
  member_count INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','moderator','founder')),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);
CREATE INDEX memberships_user_idx ON memberships(user_id);

-- ─────────────────────────── publicações

CREATE TABLE posts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  body         TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  media_url    TEXT,
  palette      SMALLINT NOT NULL DEFAULT 0,
  -- se for resposta ao convite do dia
  invite_id    UUID,
  -- republicações apontam para o original
  repost_of    UUID REFERENCES posts(id) ON DELETE CASCADE,
  hidden_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- o feed é cronológico. Não há índice por contagem de reações, de propósito.
CREATE INDEX posts_feed_idx ON posts(community_id, created_at DESC) WHERE hidden_at IS NULL;
CREATE INDEX posts_author_idx ON posts(author_id, created_at DESC);
CREATE UNIQUE INDEX posts_one_repost_idx ON posts(author_id, repost_of) WHERE repost_of IS NOT NULL;

CREATE TABLE reactions (
  post_id  UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind     TEXT NOT NULL CHECK (kind IN ('like','fire')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id, kind)
);

CREATE TABLE comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  hidden_at  TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX comments_post_idx ON comments(post_id, created_at);

-- ─────────────────────────── momentos (24 h)

CREATE TABLE moments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_url    TEXT,
  palette      SMALLINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE INDEX moments_live_idx ON moments(author_id, expires_at);

CREATE TABLE moment_views (
  moment_id UUID NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (moment_id, user_id)
);

-- ─────────────────────────── convites (por comunidade)

-- propostas na "bolsa" da comunidade
CREATE TABLE proposals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  author_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  text         TEXT NOT NULL CHECK (char_length(text) BETWEEN 3 AND 120),
  -- propostas de arranque escritas por quem funda a comunidade
  is_seed      BOOLEAN NOT NULL DEFAULT false,
  vote_count   INT NOT NULL DEFAULT 0,
  used_at      TIMESTAMPTZ,
  hidden_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX proposals_open_idx ON proposals(community_id, vote_count DESC)
  WHERE used_at IS NULL AND hidden_at IS NULL;

CREATE TABLE proposal_votes (
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, user_id)
);

-- o convite ativo de cada dia, por comunidade
CREATE TABLE invites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  proposal_id   UUID REFERENCES proposals(id) ON DELETE SET NULL,
  text          TEXT NOT NULL,
  author_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  -- dia local da comunidade, não UTC
  local_date    DATE NOT NULL,
  opens_at      TIMESTAMPTZ NOT NULL,
  closes_at     TIMESTAMPTZ NOT NULL,
  reply_count   INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (community_id, local_date)
);
CREATE INDEX invites_active_idx ON invites(community_id, closes_at DESC);

ALTER TABLE posts ADD CONSTRAINT posts_invite_fk
  FOREIGN KEY (invite_id) REFERENCES invites(id) ON DELETE SET NULL;
-- uma resposta por pessoa por convite
CREATE UNIQUE INDEX posts_one_reply_idx ON posts(author_id, invite_id) WHERE invite_id IS NOT NULL;

-- ─────────────────────────── mensagens

CREATE TABLE threads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_a < user_b)          -- par ordenado: evita duplicados
);
CREATE UNIQUE INDEX threads_pair_idx ON threads(user_a, user_b);

CREATE TABLE messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text','media')),
  mode       TEXT NOT NULL DEFAULT 'normal' CHECK (mode IN ('normal','timer','once')),
  -- body e media_url passam a NULL quando a mensagem expira. Apagamos mesmo.
  body       TEXT,
  media_url  TEXT,
  palette    SMALLINT DEFAULT 0,
  opened_at  TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  purged_at  TIMESTAMPTZ,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_thread_idx ON messages(thread_id, created_at);
CREATE INDEX messages_purge_idx ON messages(expires_at) WHERE purged_at IS NULL AND expires_at IS NOT NULL;

-- ─────────────────────────── moderação

CREATE TABLE reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type   TEXT NOT NULL CHECK (target_type IN ('post','comment','proposal','user')),
  target_id     UUID NOT NULL,
  reason        TEXT NOT NULL CHECK (reason IN ('spam','abuso','ilegal','outro')),
  note          TEXT,
  resolved_at   TIMESTAMPTZ,
  resolution    TEXT CHECK (resolution IN ('removido','mantido','suspenso')),
  resolved_by   UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, target_type, target_id)   -- uma denúncia por pessoa
);
CREATE INDEX reports_open_idx ON reports(target_type, target_id) WHERE resolved_at IS NULL;

-- ─────────────────────────── subscrições (desligado até haver escala)

CREATE TABLE subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscriber_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status                 TEXT NOT NULL CHECK (status IN ('ativa','cancelada','suspensa')),
  amount_cents           INT NOT NULL CHECK (amount_cents > 0),
  provider_subscription_id TEXT UNIQUE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (creator_id, subscriber_id)
);
