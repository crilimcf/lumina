-- Foto de perfil: opcional, complementa a cor (palette) em vez de a substituir.
-- Sem foto, continua a mostrar-se o Orb colorido de sempre.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
