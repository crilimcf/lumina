import crypto from 'node:crypto';
import { q } from '../db.js';
import { fetchPublicFeed } from './radar.js';

const NAV_PATHS = new Set([
  '/', '/ultimas', '/agora', '/ver', '/ouvir', '/descobrir', '/rss', '/newsletters',
  '/programas', '/autores', '/autor', '/login', '/sign-in', '/signin', '/assinaturas',
  '/subscrever', '/pesquisa', '/search', '/arquivo', '/contactos', '/politica-de-privacidade',
]);
const SKIP_EXT = /\.(?:jpg|jpeg|png|gif|webp|svg|ico|css|js|json|xml|pdf|zip|mp3|m4a|wav|mp4|mov|webm)(?:$|[?#])/i;

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number.parseInt(d, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function textOnly(value) {
  return decodeHtml(String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedHost(hostname) {
  return String(hostname || '').toLowerCase().replace(/^www\./, '');
}

function safeArticleUrl(rawHref, sourceUrl) {
  if (!rawHref) return null;
  let url;
  try { url = new URL(decodeHtml(rawHref), sourceUrl); }
  catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  const source = new URL(sourceUrl);
  const host = normalizedHost(url.hostname);
  const sourceHost = normalizedHost(source.hostname);
  if (host !== sourceHost && !host.endsWith(`.${sourceHost}`) && !sourceHost.endsWith(`.${host}`)) return null;
  const path = url.pathname.replace(/\/$/, '') || '/';
  if (NAV_PATHS.has(path.toLowerCase()) || SKIP_EXT.test(url.pathname)) return null;
  const segments = path.split('/').filter(Boolean);
  if (segments.length < 2 && !/\d{4}|noticia|artigo|news/i.test(path)) return null;
  url.hash = '';
  for (const key of ['fbclid','gclid','utm_source','utm_medium','utm_campaign','utm_content','utm_term']) url.searchParams.delete(key);
  return url.toString();
}

function imageFromAnchor(html, sourceUrl) {
  const match = /<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/i.exec(html);
  if (!match) return null;
  try {
    const url = new URL(decodeHtml(match[1]), sourceUrl);
    return ['http:','https:'].includes(url.protocol) ? url.toString() : null;
  } catch { return null; }
}

export function parsePublisherHeadlineLinks(html, sourceUrl, { maxItems = 14 } = {}) {
  const found = [];
  const seen = new Set();
  const anchor = /<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchor.exec(String(html || ''))) && found.length < Math.max(8, maxItems * 5)) {
    const url = safeArticleUrl(match[2], sourceUrl);
    if (!url || seen.has(url)) continue;
    const inner = match[4];
    const title = textOnly(inner).slice(0, 180);
    const words = title.split(/\s+/).filter(Boolean);
    if (title.length < 24 || title.length > 180 || words.length < 4) continue;
    if (/^(ver mais|ler mais|saber mais|continuar|partilhar|facebook|instagram|twitter|linkedin|youtube)$/i.test(title)) continue;
    seen.add(url);
    found.push({ title, externalUrl:url, imageUrl:imageFromAnchor(inner, sourceUrl) });
  }

  return found.slice(0, Math.max(1, Math.min(Number(maxItems) || 14, 24)));
}

function sourceConfig(source) {
  const raw = source?.config && typeof source.config === 'object' ? source.config : {};
  return {
    maxItems: Math.max(1, Math.min(Number(raw.maxItems) || 14, 24)),
    maxLiveHours: Math.max(6, Math.min(Number(raw.maxLiveHours) || 72, 168)),
    priority: Math.max(0, Math.min(Number(raw.priority) || 10, 100)),
    region: String(raw.region || 'Portugal').slice(0, 80),
    tags: Array.isArray(raw.tags) ? raw.tags.map(v=>String(v).slice(0,48)).filter(Boolean).slice(0,16) : [],
  };
}

function fingerprint(sourceId, url) {
  return `web:${crypto.createHash('sha256').update(`${sourceId}\n${url}`).digest('hex')}`;
}

export async function ingestWebSource(source, { fetchPageImpl = fetchPublicFeed } = {}) {
  if (!source?.id || source.kind !== 'web' || !source.url) throw new Error('Fonte web inválida');
  const config = sourceConfig(source);
  try {
    const fetched = await fetchPageImpl(source.url, { deadlineAt: Date.now() + 12_000 });
    if (fetched.notModified) {
      await q(`UPDATE radar_sources SET last_fetched_at=now(),last_success_at=now(),last_fetch_error=NULL,last_item_count=0,updated_at=now() WHERE id=$1`, [source.id]);
      return { sourceId:source.id, fetched:0, touched:0, notModified:true };
    }
    const entries = parsePublisherHeadlineLinks(fetched.text, source.url, config);
    if (!entries.length) throw new Error('Página oficial sem manchetes reconhecíveis');

    let touched = 0;
    for (const entry of entries) {
      const fp = fingerprint(source.id, entry.externalUrl);
      const tags = [...new Set([...config.tags, String(source.name || '').toLowerCase().replace(/[^a-z0-9áàâãéêíóôõúç]+/gi,'-').replace(/^-|-$/g,'')].filter(Boolean))];
      const result = await q(
        `INSERT INTO radar_items (
           type,title,summary,body,image_url,external_url,source_id,source_name,source_url,
           sponsored,tags,region,ends_at,published_at,status,priority,fingerprint,
           ingestion_trusted,ingestion_publishable
         ) VALUES (
           'news',$1,'','',$2,$3,$4,$5,$6,false,$7,$8,
           now()+make_interval(hours => $9::int),now(),'published',$10,$11,true,true
         )
         ON CONFLICT (fingerprint) DO UPDATE SET
           title=EXCLUDED.title,
           image_url=COALESCE(EXCLUDED.image_url,radar_items.image_url),
           external_url=EXCLUDED.external_url,
           source_name=EXCLUDED.source_name,
           source_url=EXCLUDED.source_url,
           tags=EXCLUDED.tags,
           region=EXCLUDED.region,
           ends_at=EXCLUDED.ends_at,
           status='published',
           priority=EXCLUDED.priority,
           updated_at=now()
         RETURNING id`,
        [entry.title,entry.imageUrl,entry.externalUrl,source.id,source.name,source.url,tags,config.region,config.maxLiveHours,config.priority,fp]
      );
      touched += result.rowCount || 0;
    }

    await q(
      `UPDATE radar_sources SET etag=$2,last_modified=$3,last_fetched_at=now(),last_success_at=now(),last_fetch_error=NULL,last_item_count=$4,updated_at=now() WHERE id=$1`,
      [source.id,fetched.etag || null,fetched.lastModified || null,entries.length]
    );
    return { sourceId:source.id, fetched:entries.length, touched, notModified:false };
  } catch (error) {
    await q(`UPDATE radar_sources SET last_fetched_at=now(),last_fetch_error=$2,updated_at=now() WHERE id=$1`, [source.id,String(error?.message || error).slice(0,500)]).catch(()=>{});
    throw error;
  }
}

export async function syncWebRadarSources({ sourceId = null } = {}) {
  const { rows:sources } = sourceId
    ? await q(`SELECT * FROM radar_sources WHERE id=$1 AND kind='web'`, [sourceId])
    : await q(`SELECT * FROM radar_sources WHERE active=true AND kind='web' ORDER BY COALESCE(last_fetched_at,'-infinity') ASC`);
  const result = { attempted:sources.length, succeeded:0, failed:0, items:0 };
  for (const source of sources) {
    try {
      const out = await ingestWebSource(source);
      result.succeeded += 1;
      result.items += out.touched || 0;
    } catch (error) {
      result.failed += 1;
      console.warn(`[radar] web ${source.name}: ${error.message}`);
    }
  }
  return result;
}
