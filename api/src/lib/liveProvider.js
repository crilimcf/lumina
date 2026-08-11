import crypto from 'node:crypto';
import { env } from '../env.js';

const SERVICE = 'ivs';

const endpointHost = () => `ivsrealtime.${env.AWS_REGION}.amazonaws.com`;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => crypto.createHmac('sha256', key).update(value).digest();

function awsDate(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amz: iso, short: iso.slice(0, 8) };
}

function signingKey(secret, shortDate, region) {
  const kDate = hmac(Buffer.from(`AWS4${secret}`, 'utf8'), shortDate);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, 'aws4_request');
}

export const liveProviderConfigured = () => Boolean(
  env.AWS_ACCESS_KEY_ID &&
  env.AWS_SECRET_ACCESS_KEY &&
  env.AWS_REGION &&
  env.AWS_IVS_STORAGE_CONFIGURATION_ARN
);

async function ivs(path, body = {}) {
  if (!liveProviderConfigured()) throw new Error('Amazon IVS Real-Time não configurado');

  const host = endpointHost();
  const payload = JSON.stringify(body);
  const payloadHash = sha256(payload);
  const { amz, short } = awsDate();

  const headers = {
    'content-type': 'application/json',
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amz,
  };
  if (env.AWS_SESSION_TOKEN) headers['x-amz-security-token'] = env.AWS_SESSION_TOKEN;

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map(name => `${name}:${String(headers[name]).trim()}\n`).join('');
  const signedHeaders = signedHeaderNames.join(';');
  const canonicalRequest = [
    'POST',
    path,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${short}/${env.AWS_REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amz,
    scope,
    sha256(canonicalRequest),
  ].join('\n');
  const signature = crypto
    .createHmac('sha256', signingKey(env.AWS_SECRET_ACCESS_KEY, short, env.AWS_REGION))
    .update(stringToSign)
    .digest('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${env.AWS_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const response = await fetch(`https://${host}${path}`, {
    method: 'POST',
    headers: { ...headers, authorization },
    body: payload,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = result?.exceptionMessage || result?.message || result?.Message || `Amazon IVS ${response.status}`;
    throw new Error(detail);
  }
  return result;
}

async function createParticipantToken({ stageArn, userId, capabilities }) {
  const result = await ivs('/CreateParticipantToken', {
    stageArn,
    userId: `lumina-${String(userId).slice(0, 80)}`,
    capabilities,
    duration: 720,
  });
  const token = result?.participantToken?.token;
  if (!token) throw new Error('Amazon IVS não devolveu um participant token válido');
  return token;
}

export async function createLiveInput({ liveId, creatorId }) {
  if (!liveProviderConfigured()) {
    if (env.NODE_ENV === 'test' || env.NODE_ENV === 'development') {
      return {
        configured: false,
        inputId: `local-${liveId}`,
        publisherToken: null,
      };
    }
    throw new Error('Amazon IVS Real-Time não configurado');
  }

  const result = await ivs('/CreateStage', {
    name: `lumina-${String(liveId).slice(0, 64)}`,
    autoParticipantRecordingConfiguration: {
      storageConfigurationArn: env.AWS_IVS_STORAGE_CONFIGURATION_ARN,
      mediaTypes: ['AUDIO_VIDEO'],
      recordingReconnectWindowSeconds: 30,
      thumbnailConfiguration: { recordingMode: 'DISABLED' },
    },
    tags: {
      Project: 'Lumina',
      Purpose: 'Live',
      LiveId: String(liveId),
    },
  });

  const stageArn = result?.stage?.arn;
  if (!stageArn) throw new Error('Amazon IVS não devolveu um Stage ARN válido');

  try {
    const publisherToken = await createParticipantToken({
      stageArn,
      userId: `creator-${creatorId}`,
      capabilities: ['PUBLISH'],
    });
    return {
      configured: true,
      inputId: stageArn,
      publisherToken,
    };
  } catch (error) {
    await ivs('/DeleteStage', { arn: stageArn }).catch(() => {});
    throw error;
  }
}

export async function getLiveSubscriberToken({ stageArn, userId }) {
  if (!stageArn || String(stageArn).startsWith('local-') || !liveProviderConfigured()) return null;
  return createParticipantToken({
    stageArn,
    userId: `viewer-${userId}`,
    capabilities: ['SUBSCRIBE'],
  });
}

export async function deleteLiveInput(inputId) {
  if (!inputId || String(inputId).startsWith('local-') || !liveProviderConfigured()) return;
  await ivs('/DeleteStage', { arn: inputId });
}
