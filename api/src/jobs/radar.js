import { createHash } from 'node:crypto';
import { q } from '../db.js';

const MAX_FEED_BYTES = 1_000_000;
const FETCH_TIMEOUT_MS = 8_000;
const RTP_SECTIONS = new Set(['pais', 'mundo', 'desporto', 'economia', 'cultura', 'videos', 'audios']);

function decodeXml(value = '') {
  return String(value)
    .replace(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/i, '$1')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_m, code) => {
      const n = code[0].toLowerCase() === 'x' ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : '';
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripMarkup(value = '') {
  return decodeXml(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(block, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(block).match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  return match ? decodeXml(match[1]).trim() : '';
}

function safeRtpArticleUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value).trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    if (host !== 'rtp.pt' && !host.endsWith('.rtp.pt')) return null;
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function assertRtpFeedUrl(value) {
  const url = new URL(String(value || '').trim());
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'www.rtp.pt' || url.port || url.username || url.password) {
    throw new Error('URL RSS RTP não autorizada');
  }
  if (url.search || url.hash) throw new Error('URL RSS RTP não autorizada');

  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === '/noticias/rss') return url.toString();
  const prefix = '/noticias/rss/';
  if (!path.startsWith(prefix) || !RTP_SECTIONS.has(path.slice(prefix.length).toLowerCase())) {
    throw new Error('Secção RSS RTP não autorizada');
  }
  return url.toString();
}

export function parseRtpRss(xml) {
  const text = String(xml || '');
  const blocks = [...text.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(match => match[1]);
  return blocks.map((block) => ({
    title: stripMarkup(extractTag(block, 'title')),
    summary: stripMarkup(extractTag(block, 'description')),
    link: safeRtpArticleUrl(extractTag(block, 'link')),
    guid: stripMarkup(extractTag(block, 'guid')),
    pubDate: stripMarkup(extractTag(block, 'pubDate')),
    category: stripMarkup(extractTag(block, 'category')),
  })).filter(item => item.title && item.link);
}

function clampMaxItems(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 100) : 30;
}

function stableFingerprint(item) {
  const sourceKey = item.guid || item.link || `${item.title}|${item.pubDate}`;
  return `rtp:${createHash('sha256').update(sourceKey).digest('hex')}`;
}

function publishedAt(value, now) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? now.toISOString() : date.toISOString();
}

export function normalizeRtpItem(item, source, now = new Date()) {
  const title = String(item.title || '').trim().slice(0, 180);
  if (!title || !item.link) return null;
  const tags = ['rtp'];
  if (item.category) tags.push(String(item.category).trim().toLowerCase().slice(0, 60));
  return {
    type: 'news',
    title,
    summary: String(item.summary || '').trim().slice(0, 1200),
    externalUrl: item.link,
    sourceId: source.id,
    sourceName: source.name || 'RTP Notícias',
    sourceUrl: source.url,
    tags: [...new Set(tags.filter(Boolean))],
    region: source.config?.region || 'PT',
    publishedAt: publishedAt(item.pubDate, now),
    fingerprint: stableFingerprint(item),
  };
}

async function fetchRtpFeed(url, fetchImpl) {
  const safeUrl = assertRtpFeedUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(safeUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        accept: 'application/rss+xml, application/xml, text/xml;q=0.9',
        'user-agent': 'LuminaRadar/1.0',
      },
    });
    if (!response.ok) throw new Error(`RTP RSS respondeu HTTP ${response.status}`);
    const declared = Number(response.headers?.get?.('content-length') || 0);
    if (Number.isFinite(declared) && declared > MAX_FEED_BYTES) throw new Error('RTP RSS excedeu o tamanho permitido');
    const body = await response.text();
    if (Buffer.byteLength(body, 'utf8') > MAX_FEED_BYTES) throw new Error('RTP RSS excedeu o tamanho permitido');
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function markSourceFailure(sourceId, error) {
  await q(
    `UPDATE radar_sources
     SET last_fetched_at=now(), last_error=$2, consecutive_failures=consecutive_failures+1, updated_at=now()
     WHERE id=$1`,
    [sourceId, String(error?.message || error).slice(0, 500)]
  );
}

export async function ingestRtpSource(source, { fetchImpl = fetch, now = new Date() } = {}) {
  try {
    const xml = await fetchRtpFeed(source.url, fetchImpl);
    const maxItems = clampMaxItems(source.config?.maxItems);
    const items = parseRtpRss(xml).slice(0, maxItems);
    let upserted = 0;

    for (const raw of items) {
      const item = normalizeRtpItem(raw, source, now);
      if (!item) continue;
      const { rows } = await q(
        `INSERT INTO radar_items (
           type, title, summary, body, external_url, source_id, source_name, source_url,
           sponsored, tags, region, published_at, status, priority, fingerprint
         ) VALUES (
           $1,$2,$3,'',$4,$5,$6,$7,false,$8,$9,$10,'published',0,$11
         )
         ON CONFLICT (fingerprint) DO UPDATE SET
           title=EXCLUDED.title,
           summary=EXCLUDED.summary,
           external_url=EXCLUDED.external_url,
           source_id=EXCLUDED.source_id,
           source_name=EXCLUDED.source_name,
           source_url=EXCLUDED.source_url,
           tags=EXCLUDED.tags,
           region=EXCLUDED.region,
           published_at=EXCLUDED.published_at,
           updated_at=now()
         WHERE radar_items.status <> 'archived'
         RETURNING id`,
        [
          item.type, item.title, item.summary, item.externalUrl, item.sourceId, item.sourceName,
          item.sourceUrl, item.tags, item.region, item.publishedAt, item.fingerprint,
        ]
      );
      upserted += rows.length;
    }

    await q(
      `UPDATE radar_sources
       SET last_fetched_at=now(), last_success_at=now(), last_error=NULL, consecutive_failures=0, updated_at=now()
       WHERE id=$1`,
      [source.id]
    );
    return { fetched: items.length, upserted };
  } catch (error) {
    await markSourceFailure(source.id, error);
    throw error;
  }
}

export async function runRadarIngestion({ fetchImpl = fetch } = {}) {
  const { rows: sources } = await q(
    `SELECT id, name, kind, url, default_type, active, trusted, config
     FROM radar_sources
     WHERE active=true AND trusted=true AND kind='rss' AND config->>'provider'='rtp'
     ORDER BY name ASC`
  );

  const result = { sources: sources.length, fetched: 0, upserted: 0, failures: 0 };
  for (const source of sources) {
    try {
      const out = await ingestRtpSource(source, { fetchImpl });
      result.fetched += out.fetched;
      result.upserted += out.upserted;
    } catch (error) {
      result.failures += 1;
      console.error(`[radar] ${source.name} falhou: ${error.message}`);
    }
  }
  return result;
}
