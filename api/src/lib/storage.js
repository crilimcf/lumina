import crypto from 'node:crypto';
import { env } from '../env.js';

/**
 * Armazenamento S3 compatível — assinatura AWS v4 feita à mão.
 *
 * Funciona tal e qual com Cloudflare R2, Backblaze B2 e AWS S3; muda só o
 * endpoint. Escolhi o R2 como referência porque não cobra saída de dados, que
 * numa app social com fotografia e vídeo é o custo que mais cresce.
 */

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export function maxUploadBytes(mime) {
  return String(mime || '').startsWith('video/') ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
}

const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hmac = (key, s) => crypto.createHmac('sha256', key).update(s).digest();

export function publicUrl(key) {
  return `${env.S3_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
}

/** URL pré-assinado para PUT direto, válido 10 minutos. */
export async function signedUploadUrl(key, mime, expires = 600, method = 'PUT') {
  if (!env.S3_BUCKET) {
    // Sem armazenamento configurado, devolve um marcador para o dev não parar.
    return `about:blank#sem-armazenamento-configurado`;
  }

  const now = new Date();
  const stamp = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = stamp.slice(0, 8);
  const scope = `${date}/${env.S3_REGION}/s3/aws4_request`;
  const host = new URL(env.S3_ENDPOINT).host;
  const path = `/${env.S3_BUCKET}/${key.split('/').map(enc).join('/')}`;

  const params = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${env.S3_ACCESS_KEY}/${scope}`,
    'X-Amz-Date': stamp,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
  });

  const canonical = [
    method, path, params.toString(),
    `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD',
  ].join('\n');

  const toSign = ['AWS4-HMAC-SHA256', stamp, scope, sha256(canonical)].join('\n');

  let k = hmac(`AWS4${env.S3_SECRET_KEY}`, date);
  k = hmac(k, env.S3_REGION);
  k = hmac(k, 's3');
  k = hmac(k, 'aws4_request');
  const signature = crypto.createHmac('sha256', k).update(toSign).digest('hex');

  return `${env.S3_ENDPOINT.replace(/\/$/, '')}${path}?${params}&X-Amz-Signature=${signature}`;
}

/** Assinaturas dos formatos que aceitamos. Os primeiros bytes nao mentem. */
const SIGNATURES = {
  'image/jpeg': (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF,
  'image/png':  (b) => b.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A])),
  'image/webp': (b) => b.subarray(0, 4).toString('ascii') === 'RIFF'
                    && b.subarray(8, 12).toString('ascii') === 'WEBP',
  // MP4 e MOV modernos usam o contentor ISO Base Media e têm a caixa `ftyp`
  // logo no início. O brand interno distingue mp4/quicktime, mas para segurança
  // basta confirmar que é realmente este contentor e manter o MIME declarado.
  'video/mp4':       (b) => b.subarray(4, 8).toString('ascii') === 'ftyp',
  'video/quicktime': (b) => b.subarray(4, 8).toString('ascii') === 'ftyp',
  // WebM começa pelo cabeçalho EBML 1A 45 DF A3.
  'video/webm':      (b) => b.subarray(0, 4).equals(Buffer.from([0x1A,0x45,0xDF,0xA3])),
};

/**
 * Le o objeto já guardado e confirma tamanho real, tamanho declarado e
 * assinatura binária do formato antes de o tornar utilizável.
 */
export async function verifyStoredMedia(key, mime, expectedBytes = null) {
  const check = SIGNATURES[mime];
  if (!check) return { ok: false, reason: 'tipo nao suportado' };
  if (!env.S3_BUCKET) return { ok: true, reason: 'armazenamento nao configurado' };

  try {
    const url = publicUrl(key);
    const meta = await fetch(url, { method: 'HEAD' });
    if (!meta.ok) return { ok: false, reason: `ficheiro inacessivel (${meta.status})` };

    const actualBytes = Number(meta.headers.get('content-length'));
    if (!Number.isSafeInteger(actualBytes) || actualBytes <= 0) {
      return { ok: false, reason: 'tamanho do ficheiro indisponivel' };
    }
    if (actualBytes > maxUploadBytes(mime)) {
      return { ok: false, reason: 'ficheiro demasiado grande' };
    }
    if (expectedBytes !== null && actualBytes !== Number(expectedBytes)) {
      return { ok: false, reason: 'tamanho real nao corresponde ao declarado' };
    }

    const res = await fetch(url, { headers: { range: 'bytes=0-63' } });
    if (!res.ok) return { ok: false, reason: `ficheiro inacessivel (${res.status})` };
    const head = Buffer.from(await res.arrayBuffer());
    if (head.length < 12) return { ok: false, reason: 'ficheiro demasiado pequeno' };
    return check(head)
      ? { ok: true, bytes: actualBytes }
      : { ok: false, reason: 'assinatura nao corresponde ao tipo declarado' };
  } catch (err) {
    return { ok: false, reason: `erro ao verificar: ${err.message}` };
  }
}

// Mantém compatibilidade com código antigo que ainda importa este nome.
export const verifyStoredImage = verifyStoredMedia;

/** Apaga um objeto do armazenamento. Usado quando a verificacao falha. */
export async function removeObject(key) {
  if (!env.S3_BUCKET) return;
  const url = await signedUploadUrl(key, 'application/octet-stream', 300, 'DELETE');
  await fetch(url, { method: 'DELETE' });
}
