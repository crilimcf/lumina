import crypto from 'node:crypto';
import { env } from '../env.js';
import { q } from '../db.js';
import { HttpError } from '../middleware/auth.js';
import { maxUploadBytes, publicUrl, signedUploadUrl } from './storage.js';

const OPENAI_BASE = 'https://api.openai.com/v1';
const TEXT_MODEL = () => env.OPENAI_TEXT_MODEL || 'gpt-5.6-luna';
const EMBEDDING_MODEL = () => env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const IMAGE_MODEL = () => env.OPENAI_IMAGE_MODEL || 'gpt-image-2';

const configured = () => Boolean(env.OPENAI_API_KEY);

function upstreamError(status, message = 'A IA está temporariamente indisponível') {
  const error = new HttpError(status, message, 'ai_upstream');
  return error;
}

async function openaiFetch(path, init = {}, timeoutMs = 35_000) {
  if (!configured()) throw new HttpError(503, 'A IA ainda não está configurada', 'ai_not_configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${OPENAI_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        ...(init.headers || {}),
      },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      console.error('[openai] request failed', response.status, body?.error?.code || body?.error?.type || 'unknown', response.headers.get('x-request-id') || '');
      if (response.status === 429) throw upstreamError(429, 'A IA está ocupada. Tenta novamente dentro de momentos.');
      if (response.status === 401 || response.status === 403) throw upstreamError(503, 'A ligação à IA precisa de ser verificada.');
      throw upstreamError(503);
    }
    return response;
  } catch (error) {
    if (error?.name === 'AbortError') throw upstreamError(504, 'A IA demorou demasiado a responder.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function outputText(payload) {
  const parts = [];
  for (const item of payload?.output || []) {
    if (item?.type !== 'message') continue;
    for (const content of item.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

export function openaiStatus() {
  return {
    configured: configured(),
    textModel: TEXT_MODEL(),
    embeddingModel: EMBEDDING_MODEL(),
    imageModel: IMAGE_MODEL(),
  };
}

export async function responseText({ instructions, input, maxOutputTokens = 1800 }) {
  const response = await openaiFetch('/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: TEXT_MODEL(),
      store: false,
      instructions,
      input,
      max_output_tokens: maxOutputTokens,
    }),
  });
  const payload = await response.json();
  const text = outputText(payload);
  if (!text) throw upstreamError(503, 'A IA não devolveu uma resposta utilizável.');
  return {
    text,
    model: payload.model || TEXT_MODEL(),
    usage: {
      inputTokens: Number(payload.usage?.input_tokens || 0),
      outputTokens: Number(payload.usage?.output_tokens || 0),
    },
  };
}

export async function embedTexts(inputs) {
  const texts = (inputs || []).map(value => String(value || '').slice(0, 8000));
  if (!texts.length) return { vectors: [], model: EMBEDDING_MODEL(), usage: { inputTokens: 0, outputTokens: 0 } };
  const response = await openaiFetch('/embeddings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL(), input: texts }),
  });
  const payload = await response.json();
  const vectors = [...(payload.data || [])]
    .sort((a, b) => Number(a.index) - Number(b.index))
    .map(item => item.embedding);
  if (vectors.length !== texts.length || vectors.some(vector => !Array.isArray(vector))) {
    throw upstreamError(503, 'A pesquisa inteligente não conseguiu calcular a relevância.');
  }
  return {
    vectors,
    model: payload.model || EMBEDDING_MODEL(),
    usage: { inputTokens: Number(payload.usage?.prompt_tokens || payload.usage?.total_tokens || 0), outputTokens: 0 },
  };
}

function imageFromPayload(payload) {
  const base64 = payload?.data?.[0]?.b64_json;
  if (!base64) throw upstreamError(503, 'A IA não devolveu uma imagem utilizável.');
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length || buffer.length > maxUploadBytes('image/png')) throw upstreamError(503, 'A imagem gerada não é válida.');
  return buffer;
}

export async function generateImage(prompt) {
  const response = await openaiFetch('/images/generations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: IMAGE_MODEL(),
      prompt,
      size: '1024x1024',
      quality: env.OPENAI_IMAGE_QUALITY || 'low',
    }),
  }, 90_000);
  const payload = await response.json();
  return { buffer: imageFromPayload(payload), model: IMAGE_MODEL() };
}

export async function editImage({ sourceBuffer, sourceMime, prompt }) {
  const form = new FormData();
  form.set('model', IMAGE_MODEL());
  form.set('prompt', prompt);
  form.append('image[]', new Blob([sourceBuffer], { type: sourceMime || 'image/png' }), `source.${sourceMime === 'image/jpeg' ? 'jpg' : sourceMime === 'image/webp' ? 'webp' : 'png'}`);
  const response = await openaiFetch('/images/edits', { method: 'POST', body: form }, 120_000);
  const payload = await response.json();
  return { buffer: imageFromPayload(payload), model: IMAGE_MODEL() };
}

export async function saveGeneratedImage({ userId, buffer, purpose = null }) {
  const mime = 'image/png';
  const key = `${userId}/${Date.now()}-ai-${crypto.randomBytes(6).toString('hex')}.png`;
  const uploadUrl = await signedUploadUrl(key, mime);
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': mime }, body: buffer });
  if (!put.ok) throw new HttpError(503, 'Não foi possível guardar a imagem criada pela IA', 'ai_storage');
  const url = publicUrl(key);
  await q(
    `INSERT INTO uploads (owner_id,key,url,mime,bytes,confirmed_at,consumed_at,purpose)
     VALUES ($1,$2,$3,$4,$5,now(),CASE WHEN $6::text IS NULL THEN NULL ELSE now() END,$6)`,
    [userId, key, url, mime, buffer.length, purpose]
  );
  return { key, url, mime, bytes: buffer.length };
}

export async function recordAiUsage(userId, feature, result, imageCount = 0) {
  await q(
    `INSERT INTO ai_usage_events (user_id,feature,model,input_tokens,output_tokens,image_count)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      userId || null,
      feature,
      result?.model || TEXT_MODEL(),
      Number(result?.usage?.inputTokens || 0),
      Number(result?.usage?.outputTokens || 0),
      Number(imageCount || 0),
    ]
  ).catch(error => console.error('[openai] usage event', error.message));
}

export function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}
