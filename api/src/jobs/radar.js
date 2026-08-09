import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { XMLParser } from 'fast-xml-parser';
import { pool, q } from '../db.js';

const MAX_FEED_BYTES = 1_500_000;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const INGEST_LOCK = 4_817_337;
const AUTO_RSS_TYPES = new Set(['news', 'trend', 'editorial']);

const blocked = new net.BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked.addSubnet(network, prefix, 'ipv4');
blocked.addAddress('::', 'ipv6');
blocked.addAddress('::1', 'ipv6');
for (const [network, prefix] of [
  ['::ffff:0:0', 96], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32],
]) blocked.addSubnet(network, prefix, 'ipv6');

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '#cdata',
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: false,
  allowBooleanAttributes: true,
});

const asArray = (value) => value === undefined || value === null ? [] : (Array.isArray(value) ? value : [value]);

function localKey(key) {
  return String(key).split(':').at(-1)?.toLowerCase();
}

function pickLocal(object, name) {
  if (!object || typeof object !== 'object') return undefined;
  if (Object.hasOwn(object, name)) return object[name];
  const wanted = String(name).toLowerCase();
  const hit = Object.entries(object).find(([key]) => localKey(key) === wanted);
  return hit?.[1];
}

function textOf(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    if (value['#text'] !== undefined) return textOf(value['#text']);
    if (value['#cdata'] !== undefined) return textOf(value['#cdata']);
    return Object.entries(value)
      .filter(([key]) => !key.startsWith('@_'))
      .map(([, nested]) => textOf(nested))
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function cleanText(value, limit) {
  const text = decodeEntities(textOf(value))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, limit);
}

function publicHttpUrl(value) {
  const raw = cleanText(value, 2_048);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch { return null; }
}

function linkOf(item) {
  const links = asArray(pickLocal(item, 'link'));
  const candidates = links
    .map(link => {
      if (typeof link === 'string') return { url: publicHttpUrl(link), rel: '' };
      if (!link || typeof link !== 'object') return { url: null, rel: '' };
      return {
        url: publicHttpUrl(link['@_href'] || link['@_url'] || link['#text']),
        rel: String(link['@_rel'] || '').toLowerCase(),
      };
    })
    .filter(candidate => candidate.url);
  return candidates.find(candidate => !candidate.rel || candidate.rel === 'alternate')?.url || candidates[0]?.url || null;
}

function imageOf(item) {
  for (const key of ['media:content', 'media:thumbnail', 'enclosure']) {
    for (const node of asArray(item?.[key] ?? pickLocal(item, key))) {
      if (!node || typeof node !== 'object') continue;
      const type = String(node['@_type'] || '').toLowerCase();
      const medium = String(node['@_medium'] || '').toLowerCase();
      if (key === 'enclosure' && type && !type.startsWith('image/')) continue;
      if (key === 'media:content' && type && !type.startsWith('image/') && medium !== 'image') continue;
      const url = publicHttpUrl(node['@_url'] || node['@_href']);
      if (url) return url;
    }
  }
  return null;
}

function categoriesOf(item) {
  return asArray(pickLocal(item, 'category'))
    .map(category => {
      if (typeof category === 'string') return cleanText(category, 48).toLowerCase();
      return cleanText(category?.['@_term'] || category?.['#text'], 48).toLowerCase();
    })
    .filter(Boolean);
}

function dateOf(item, nowMs) {
  const raw = item?.published ?? item?.pubDate ?? item?.updated ?? item?.['dc:date'] ?? pickLocal(item, 'date');
  const parsed = raw ? new Date(cleanText(raw, 100)) : new Date(nowMs);
  if (Number.isNaN(parsed.getTime())) return new Date(nowMs).toISOString();
  if (parsed.getTime() > nowMs + 10 * 60_000) return new Date(nowMs).toISOString();
  return parsed.toISOString();
}

function normalizeEntry(item, nowMs) {
  const title = cleanText(pickLocal(item, 'title'), 180);
  const externalUrl = linkOf(item);
  if (!title || !externalUrl) return null;

  const summaryValue = item?.summary ?? item?.description ?? item?.['content:encoded'] ?? item?.content;
  const publishedAt = dateOf(item, nowMs);
  const stableId = cleanText(item?.guid ?? item?.id ?? externalUrl ?? `${title}:${publishedAt}`, 2_000);

  return {
    stableId,
    title,
    summary: cleanText(summaryValue, 1_200),
    externalUrl,
    imageUrl: imageOf(item),
    publishedAt,
    tags: categoriesOf(item),
  };
}

export function parseSyndicationFeed(xml, { now = Date.now() } = {}) {
  const text = String(xml || '');
  if (!text.trim()) throw new Error('Feed vazio');
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('Feed XML com DTD/entidades não permitido');

  let doc;
  try { doc = xmlParser.parse(text); }
  catch { throw new Error('Feed XML inválido'); }

  const rss = pickLocal(doc, 'rss');
  const channel = rss ? pickLocal(rss, 'channel') : null;
  const atom = pickLocal(doc, 'feed');
  const rdf = Object.entries(doc || {}).find(([key]) => localKey(key) === 'rdf')?.[1];
  const rawItems = channel ? pickLocal(channel, 'item') : (atom ? pickLocal(atom, 'entry') : pickLocal(rdf, 'item'));
  const entries = asArray(rawItems).map(item => normalizeEntry(item, now)).filter(Boolean);
  if (!channel && !atom && !rdf) throw new Error('Formato RSS/Atom não reconhecido');
  return entries;
}

function isBlockedAddress(address, family) {
  if (family === 4) return blocked.check(address, 'ipv4');
  if (family === 6) return blocked.check(address, 'ipv6');
  return true;
}

export async function resolvePublicFeedTarget(input) {
  let url;
  try { url = new URL(String(input || '')); }
  catch { throw new Error('URL RSS inválida'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('A fonte RSS tem de usar HTTP ou HTTPS');
  if (url.username || url.password) throw new Error('Credenciais na URL RSS não são permitidas');
  if ((url.protocol === 'http:' && url.port && url.port !== '80') || (url.protocol === 'https:' && url.port && url.port !== '443')) {
    throw new Error('A fonte RSS tem de usar a porta HTTP/HTTPS padrão');
  }

  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Host RSS privado não permitido');
  }

  const literalFamily = net.isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length) throw new Error('Host RSS sem endereço resolvido');
  if (addresses.some(({ address, family }) => isBlockedAddress(address, family))) {
    throw new Error('Host RSS resolve para uma rede privada/reservada');
  }

  return { url, address: addresses[0].address, family: addresses[0].family };
}

export async function fetchPublicFeed(input, { etag = null, lastModified = null, redirects = 0 } = {}) {
  if (redirects > MAX_REDIRECTS) throw new Error('Demasiados redirects na fonte RSS');
  const target = await resolvePublicFeedTarget(input);
  const transport = target.url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const headers = {
      accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, text/plain;q=0.5, */*;q=0.1',
      'accept-encoding': 'identity',
      'user-agent': 'LuminaRadar/1.0 (+authorized-feed-ingestion)',
    };
    if (etag) headers['if-none-match'] = etag;
    if (lastModified) headers['if-modified-since'] = lastModified;

    const request = transport.get(target.url, {
      headers,
      servername: target.url.hostname,
      lookup: (_hostname, _options, callback) => callback(null, target.address, target.family),
    }, (response) => {
      const status = response.statusCode || 0;
      if (status === 304) {
        response.resume();
        resolve({ notModified: true, text: '', etag: etag || null, lastModified: lastModified || null });
        return;
      }
      if (status >= 300 && status < 400 && response.headers.location) {
        const next = new URL(response.headers.location, target.url).toString();
        response.resume();
        fetchPublicFeed(next, { etag, lastModified, redirects: redirects + 1 }).then(resolve, reject);
        return;
      }
      if (status !== 200) {
        response.resume();
        reject(new Error(`Fonte RSS respondeu HTTP ${status}`));
        return;
      }
      const encoding = String(response.headers['content-encoding'] || 'identity').toLowerCase();
      if (encoding !== 'identity') {
        response.resume();
        reject(new Error('Compressão inesperada na fonte RSS'));
        return;
      }
      const declared = Number(response.headers['content-length'] || 0);
      if (declared > MAX_FEED_BYTES) {
        response.resume();
        reject(new Error('Feed RSS demasiado grande'));
        return;
      }

      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > MAX_FEED_BYTES) {
          request.destroy(new Error('Feed RSS demasiado grande'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        resolve({
          notModified: false,
          text: Buffer.concat(chunks).toString('utf8'),
          etag: response.headers.etag || null,
          lastModified: response.headers['last-modified'] || null,
        });
      });
    });
    request.setTimeout(FETCH_TIMEOUT_MS, () => request.destroy(new Error('Timeout ao obter fonte RSS')));
    request.on('error', reject);
  });
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function sourceConfig(source) {
  const config = source?.config && typeof source.config === 'object' ? source.config : {};
  return {
    maxItems: boundedInteger(config.maxItems, 20, 1, 50),
    maxAgeDays: boundedInteger(config.maxAgeDays, 14, 1, 365),
    priority: boundedInteger(config.priority, 0, 0, 100),
    autoPublish: config.autoPublish !== false,
    region: config.region ? String(config.region).trim().slice(0, 80) : null,
    tags: Array.isArray(config.tags)
      ? [...new Set(config.tags.map(tag => cleanText(tag, 48).toLowerCase()).filter(Boolean))].slice(0, 12)
      : [],
  };
}

function fingerprint(sourceId, entry) {
  return `rss:${crypto.createHash('sha256').update(`${sourceId}\n${entry.stableId}`).digest('hex')}`;
}

async function recordFailure(sourceId, error) {
  await q(
    `UPDATE radar_sources
     SET last_fetched_at=now(), last_fetch_error=$2, updated_at=now()
     WHERE id=$1`,
    [sourceId, String(error?.message || error).slice(0, 500)]
  ).catch(() => {});
}

export async function ingestRssSource(source, { fetchFeedImpl = fetchPublicFeed } = {}) {
  if (!source?.id || source.kind !== 'rss' || !source.url) throw new Error('Fonte RSS inválida');
  if (!AUTO_RSS_TYPES.has(source.default_type)) throw new Error('RSS automático suporta notícias, tendências ou editorial');
  const config = sourceConfig(source);

  try {
    const fetched = await fetchFeedImpl(source.url, { etag: source.etag, lastModified: source.last_modified });
    if (fetched.notModified) {
      await q(
        `UPDATE radar_sources
         SET last_fetched_at=now(), last_success_at=now(), last_fetch_error=NULL, last_item_count=0, updated_at=now()
         WHERE id=$1`,
        [source.id]
      );
      return { sourceId: source.id, fetched: 0, touched: 0, notModified: true };
    }

    const cutoff = Date.now() - config.maxAgeDays * 86_400_000;
    const entries = parseSyndicationFeed(fetched.text)
      .filter(entry => Date.parse(entry.publishedAt) >= cutoff)
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      .slice(0, config.maxItems);
    const initialStatus = source.trusted && config.autoPublish ? 'published' : 'draft';
    let touched = 0;

    for (const entry of entries) {
      const tags = [...new Set([...config.tags, ...entry.tags])].slice(0, 12);
      const { rowCount } = await q(
        `INSERT INTO radar_items (
           type, title, summary, body, image_url, external_url, source_id, source_name, source_url,
           sponsored, tags, region, published_at, status, priority, fingerprint
         ) VALUES ($1,$2,$3,'',$4,$5,$6,$7,$8,false,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (fingerprint) DO UPDATE SET
           type=EXCLUDED.type,
           title=EXCLUDED.title,
           summary=EXCLUDED.summary,
           image_url=EXCLUDED.image_url,
           external_url=EXCLUDED.external_url,
           source_id=EXCLUDED.source_id,
           source_name=EXCLUDED.source_name,
           source_url=EXCLUDED.source_url,
           tags=EXCLUDED.tags,
           region=EXCLUDED.region,
           published_at=EXCLUDED.published_at,
           priority=EXCLUDED.priority,
           updated_at=now()
         WHERE radar_items.status <> 'archived'`,
        [
          source.default_type, entry.title, entry.summary, entry.imageUrl, entry.externalUrl,
          source.id, source.name, source.url, tags, config.region, entry.publishedAt,
          initialStatus, config.priority, fingerprint(source.id, entry),
        ]
      );
      touched += rowCount;
    }

    await q(
      `UPDATE radar_sources SET
         etag=$2, last_modified=$3, last_fetched_at=now(), last_success_at=now(),
         last_fetch_error=NULL, last_item_count=$4, updated_at=now()
       WHERE id=$1`,
      [source.id, fetched.etag || null, fetched.lastModified || null, entries.length]
    );
    return { sourceId: source.id, fetched: entries.length, touched, notModified: false };
  } catch (error) {
    await recordFailure(source.id, error);
    throw error;
  }
}

export async function syncRadarSources({ sourceId = null, fetchFeedImpl } = {}) {
  const lockClient = await pool.connect();
  let locked = false;
  try {
    const lockResult = await lockClient.query('SELECT pg_try_advisory_lock($1) AS locked', [INGEST_LOCK]);
    locked = !!lockResult.rows[0]?.locked;
    if (!locked) return { skipped: true, attempted: 0, succeeded: 0, failed: 0, items: 0 };

    const { rows: sources } = sourceId
      ? await q(`SELECT * FROM radar_sources WHERE id=$1 AND kind='rss'`, [sourceId])
      : await q(`SELECT * FROM radar_sources WHERE active=true AND kind='rss' ORDER BY COALESCE(last_fetched_at, '-infinity') ASC`);

    const result = { skipped: false, attempted: sources.length, succeeded: 0, failed: 0, items: 0 };
    for (const source of sources) {
      try {
        const synced = await ingestRssSource(source, { fetchFeedImpl });
        result.succeeded++;
        result.items += synced.fetched;
      } catch (error) {
        result.failed++;
        console.error(`[radar] fonte ${source.name} falhou:`, error.message);
      }
    }
    return result;
  } finally {
    if (locked) await lockClient.query('SELECT pg_advisory_unlock($1)', [INGEST_LOCK]).catch(() => {});
    lockClient.release();
  }
}
