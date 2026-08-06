import 'dotenv/config';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta a variavel de ambiente ${name}`);
  return v;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 3000),
  DATABASE_URL: required('DATABASE_URL'),
  JWT_SECRET: required('JWT_SECRET'),
  // Railway e Supabase servem Postgres com certificado proprio.
  PGSSL: process.env.PGSSL === 'true',

  APP_URL: process.env.APP_URL || 'http://localhost:5173',
  CORS_ORIGIN: process.env.CORS_ORIGIN,

  // Email (Resend). Sem chave, os emails vao para a consola.
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM || 'Lumina <ola@lumina.app>',

  // Armazenamento S3 compativel (Cloudflare R2 por omissao).
  S3_ENDPOINT: process.env.S3_ENDPOINT || '',
  S3_BUCKET: process.env.S3_BUCKET || '',
  S3_REGION: process.env.S3_REGION || 'auto',
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY || '',
  S3_SECRET_KEY: process.env.S3_SECRET_KEY || '',
  S3_PUBLIC_URL: process.env.S3_PUBLIC_URL || '',

  // Funcionalidades desligadas ate haver escala que as justifique.
  FEATURE_SUBSCRIPTIONS: process.env.FEATURE_SUBSCRIPTIONS === 'true',

  // Moderacao
  REPORTS_TO_AUTOHIDE: Number(process.env.REPORTS_TO_AUTOHIDE || 3),
  PROPOSALS_PER_WEEK: Number(process.env.PROPOSALS_PER_WEEK || 3),
  MIN_ACCOUNT_AGE_HOURS: Number(process.env.MIN_ACCOUNT_AGE_HOURS || 24),
  // Idade minima. O RGPD fixa 16; Portugal manteve os 16.
  MIN_AGE: Number(process.env.MIN_AGE || 16),

  // Convites e mensagens
  SEED_PROPOSALS_REQUIRED: Number(process.env.SEED_PROPOSALS_REQUIRED || 5),
  EPHEMERAL_SECONDS: Number(process.env.EPHEMERAL_SECONDS || 10),
  ONCE_SECONDS: Number(process.env.ONCE_SECONDS || 6),
};
