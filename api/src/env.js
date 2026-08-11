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
  PGSSL: process.env.PGSSL === 'true',

  APP_URL: process.env.APP_URL || 'http://localhost:5173',
  CORS_ORIGIN: process.env.CORS_ORIGIN,

  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM || 'Lumina <ola@lumina.app>',

  S3_ENDPOINT: process.env.S3_ENDPOINT || '',
  S3_BUCKET: process.env.S3_BUCKET || '',
  S3_REGION: process.env.S3_REGION || 'auto',
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY || '',
  S3_SECRET_KEY: process.env.S3_SECRET_KEY || '',
  S3_PUBLIC_URL: process.env.S3_PUBLIC_URL || '',

  // WebRTC/TURN. As credenciais de longa duração ficam exclusivamente no backend.
  // Cloudflare Realtime TURN é preferido: o backend troca a TURN key por
  // credenciais curtas antes de cada chamada. TURN_URLS permite um fornecedor
  // TURN alternativo/gerido sem recompilar o frontend.
  TURN_CLOUDFLARE_KEY_ID: process.env.TURN_CLOUDFLARE_KEY_ID || '',
  TURN_CLOUDFLARE_API_TOKEN: process.env.TURN_CLOUDFLARE_API_TOKEN || '',
  TURN_URLS: process.env.TURN_URLS || '',
  TURN_USERNAME: process.env.TURN_USERNAME || '',
  TURN_CREDENTIAL: process.env.TURN_CREDENTIAL || '',

  // Lumina Live usa Amazon IVS Real-Time. Estas credenciais ficam apenas na API
  // (Railway) e nunca são expostas ao browser. O browser recebe somente tokens
  // temporários de participante emitidos pela API para cada Stage.
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || '',
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || '',
  AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN || '',
  AWS_REGION: process.env.AWS_REGION || 'eu-west-1',
  AWS_IVS_STORAGE_CONFIGURATION_ARN: process.env.AWS_IVS_STORAGE_CONFIGURATION_ARN || '',
  AWS_IVS_RECORDINGS_BUCKET: process.env.AWS_IVS_RECORDINGS_BUCKET || '',

  FEATURE_SUBSCRIPTIONS: process.env.FEATURE_SUBSCRIPTIONS === 'true',

  // Pagamentos das Salas Ultra. Sem chaves, públicas/privadas continuam a funcionar
  // e as Ultra ficam explicitamente pendentes em vez de fingir um pagamento.
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
  ULTRA_ROOM_CREATE_CENTS: Number(process.env.ULTRA_ROOM_CREATE_CENTS || 299),
  ULTRA_ROOM_ENTRY_CENTS: Number(process.env.ULTRA_ROOM_ENTRY_CENTS || 149),

  REPORTS_TO_AUTOHIDE: Number(process.env.REPORTS_TO_AUTOHIDE || 3),
  PROPOSALS_PER_WEEK: Number(process.env.PROPOSALS_PER_WEEK || 3),
  MIN_ACCOUNT_AGE_HOURS: Number(process.env.MIN_ACCOUNT_AGE_HOURS || 24),
  MIN_AGE: Number(process.env.MIN_AGE || 16),

  SEED_PROPOSALS_REQUIRED: Number(process.env.SEED_PROPOSALS_REQUIRED || 5),
  EPHEMERAL_SECONDS: Number(process.env.EPHEMERAL_SECONDS || 10),
  ONCE_SECONDS: Number(process.env.ONCE_SECONDS || 6),
};
