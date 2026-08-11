import http from 'node:http';
import https from 'node:https';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { resolvePublicFeedTarget } from '../jobs/radar.js';

const IMAGE_TIMEOUT_MS = 8_000;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const SAFE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/x-png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/apng',
]);

function remainingMs(deadlineAt) {
  const remaining = Number(deadlineAt) - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) throw new Error('Timeout ao obter imagem Radar');
  return remaining;
}

function safeReferer(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch { return null; }
}

function limitBytes(maxBytes) {
  let total = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      total += chunk.length;
      if (total > maxBytes) return callback(new Error('Imagem Radar demasiado grande'));
      callback(null, chunk);
    },
  });
}

async function openPublicImage(input, {
  referer = null,
  redirects = 0,
  deadlineAt = Date.now() + IMAGE_TIMEOUT_MS,
  maxBytes = MAX_IMAGE_BYTES,
  resolveTargetImpl = resolvePublicFeedTarget,
} = {}) {
  if (redirects > MAX_REDIRECTS) throw new Error('Demasiados redirects na imagem Radar');
  remainingMs(deadlineAt);

  const target = await resolveTargetImpl(input, { deadlineAt });
  const transport = target.url.protocol === 'https:' ? https : http;
  const requestReferer = safeReferer(referer);

  return new Promise((resolve, reject) => {
    let settled = false;
    let headerTimeout;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (headerTimeout) clearTimeout(headerTimeout);
      fn(value);
    };

    const headers = {
      accept: 'image/avif,image/webp,image/apng,image/jpeg,image/png,image/gif,image/*;q=0.8,*/*;q=0.5',
      'accept-encoding': 'identity',
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1 LuminaRadar/1.0',
    };
    if (requestReferer) headers.referer = requestReferer;

    let request;
    try {
      request = transport.get(target.url, {
        headers,
        servername: target.url.hostname,
        family: target.family,
        autoSelectFamily: false,
        lookup: (_hostname, options, callback) => {
          if (options?.all) return callback(null, [{ address: target.address, family: target.family }]);
          callback(null, target.address, target.family);
        },
      }, response => {
        if (headerTimeout) clearTimeout(headerTimeout);
        const status = response.statusCode || 0;

        if (status >= 300 && status < 400 && response.headers.location) {
          let next;
          try { next = new URL(response.headers.location, target.url).toString(); }
          catch {
            response.resume();
            finish(reject, new Error('Redirect inválido na imagem Radar'));
            return;
          }
          response.resume();
          openPublicImage(next, {
            referer: requestReferer || target.url.toString(),
            redirects: redirects + 1,
            deadlineAt,
            maxBytes,
            resolveTargetImpl,
          }).then(value => finish(resolve, value), error => finish(reject, error));
          return;
        }

        if (status < 200 || status >= 300) {
          response.resume();
          finish(reject, new Error(`HTTP ${status} ao obter imagem Radar`));
          return;
        }

        const contentType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (!SAFE_IMAGE_TYPES.has(contentType)) {
          response.resume();
          finish(reject, new Error('Tipo de imagem Radar não suportado'));
          return;
        }

        const announcedLength = Number(response.headers['content-length'] || 0);
        if (Number.isFinite(announcedLength) && announcedLength > maxBytes) {
          response.resume();
          finish(reject, new Error('Imagem Radar demasiado grande'));
          return;
        }

        finish(resolve, {
          response,
          contentType,
          etag: response.headers.etag || null,
          lastModified: response.headers['last-modified'] || null,
          maxBytes,
          deadlineAt,
        });
      });
    } catch (error) {
      finish(reject, error);
      return;
    }

    request.on('error', error => finish(reject, error));
    headerTimeout = setTimeout(() => {
      request.destroy(new Error('Timeout ao obter imagem Radar'));
    }, remainingMs(deadlineAt));
  });
}

export async function pipePublicImage(input, destination, {
  referer = null,
  deadlineAt = Date.now() + IMAGE_TIMEOUT_MS,
  maxBytes = MAX_IMAGE_BYTES,
  resolveTargetImpl = resolvePublicFeedTarget,
  onHeaders = null,
} = {}) {
  const image = await openPublicImage(input, {
    referer,
    deadlineAt,
    maxBytes,
    resolveTargetImpl,
  });

  if (typeof onHeaders === 'function') {
    onHeaders({
      contentType: image.contentType,
      etag: image.etag,
      lastModified: image.lastModified,
    });
  }

  const limiter = limitBytes(image.maxBytes);
  const transferTimeout = setTimeout(() => {
    image.response.destroy(new Error('Timeout ao obter imagem Radar'));
    limiter.destroy(new Error('Timeout ao obter imagem Radar'));
  }, remainingMs(image.deadlineAt));

  try {
    await pipeline(image.response, limiter, destination);
  } finally {
    clearTimeout(transferTimeout);
  }
}
