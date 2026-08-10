import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { q } from '../db.js';
import { resolvePublicFeedTarget, resolveRedirectUrl } from './radar.js';

const NAV_PATHS = new Set([
  '/', '/ultimas', '/agora', '/ver', '/ouvir', '/descobrir', '/rss', '/newsletters',
  '/programas', '/autores', '/autor', '/login', '/sign-in', '/signin', '/assinaturas',
  '/subscrever', '/pesquisa', '/search', '/arquivo', '/contactos', '/politica-de-privacidade',
]);
const SKIP_EXT = /\.(?:jpg|jpeg|png|gif|webp|svg|ico|css|js|json|xml|pdf|zip|mp3|m4a|wav|mp4|mov|webm)(?:$|[?#])/i;
const MAX_PAGE_BYTES = 4_000_000;
const PAGE_TIMEOUT_MS = 15_000;
const MAX_PAGE_REDIRECTS = 3;

function remainingMs(deadlineAt) {
  const remaining = Number(deadlineAt) - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) throw new Error('Timeout total ao obter página oficial');
  return remaining;
}

// Páginas editoriais são significativamente maiores do que RSS. Reutilizamos a
// resolução DNS/anti-SSRF do coletor RSS, mas com um limite HTML próprio e um
// User-Agent honesto (não tenta imitar browser nem contornar proteções do site).
export async function fetchPublicPublisherPage(input, {
  redirects = 0,
  deadlineAt = Date.now() + PAGE_TIMEOUT_MS,
  resolveTargetImpl = resolvePublicFeedTarget,
} = {}) {
  if (redirects > MAX_PAGE_REDIRECTS) throw new Error('Demasiados redirects na página oficial');
  remainingMs(deadlineAt);
  const target = await resolveTargetImpl(input, { deadlineAt });
  const transport = target.url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    let settled = false;
    let absoluteTimeout = null;
    const finishResolve = (value) => {
      if (settled) return;
      settled = true;
      if (absoluteTimeout) clearTimeout(absoluteTimeout);
      resolve(value);
    };
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      if (absoluteTimeout) clearTimeout(absoluteTimeout);
      reject(error instanceof Error ? error : new Error(String(error || 'Falha ao obter página oficial')));
    };

    const request = transport.get(target.url, {
      headers: {
        accept: 'text/html, application/xhtml+xml;q=0.9, */*;q=0.1',
        'accept-encoding': 'identity',
        'user-agent': 'LuminaRadar/1.0 (+public-headline-ingestion)',
      },
      servername: target.url.hostname,
      family: target.family,
      autoSelectFamily: false,
      lookup: (_hostname, options, callback) => {
        if (options?.all) return callback(null, [{ address:target.address, family:target.family }]);
        callback(null, target.address, target.family);
      },
    }, (response) => {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        let next;
        try { next = resolveRedirectUrl(response.headers.location, target.url); }
        catch (error) { response.resume(); finishReject(error); return; }
        response.resume();
        fetchPublicPublisherPage(next, { redirects:redirects + 1, deadlineAt, resolveTargetImpl })
          .then(finishResolve, finishReject);
        return;
      }
      if (status !== 200) {
        response.resume();
        finishReject(new Error(`Página oficial respondeu HTTP ${status}`));
        return;
      }

      const encoding = String(response.headers['content-encoding'] || 'identity').toLowerCase();
      if (encoding !== 'identity') {
        response.resume();
        finishReject(new Error('Compressão inesperada na página oficial'));
        return;
      }
      const declared = Number(response.headers['content-length'] || 0);
      if (declared > MAX_PAGE_BYTES) {
        response.resume();
        finishReject(new Error('Página oficial demasiado grande'));
        return;
      }

      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > MAX_PAGE_BYTES) {
          const error = new Error('Página oficial demasiado grande');
          request.destroy(error);
          finishReject(error);
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (!response.complete) return finishReject(new Error('Resposta da página oficial truncada'));
        finishResolve({
          notModified:false,
          text:Buffer.concat(chunks).toString('utf8'),
          etag:response.headers.etag || null,
          lastModified:response.headers['last-modified'] || null,
        });
      });
      response.once('aborted', () => finishReject(new Error('Resposta da página oficial interrompida')));
      response.once('error', finishReject);
      response.once('close', () => {
        if (!response.complete && !settled) finishReject(new Error('Resposta da página oficial truncada'));
      });
    });

    absoluteTimeout = setTimeout(() => {
      const error = new Error('Timeout total ao obter página oficial');
      request.destroy(error); finishReject(error);
    }, remainingMs(deadlineAt));
    request.setTimeout(PAGE_TIMEOUT_MS, () => {
      const error = new Error('Timeout de inatividade ao obter página oficial');
      request.destroy(error); finishReject(error);
    });
    request.on('error', finishReject);
  });
}

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

function isHeadlinePartner(source) {
  return source?.kind === 'partner' && source?.config?.adapter === 'headline-links';
}

function fingerprint(sourceId, url) {
  return `web:${crypto.createHash('sha256').update(`${sourceId}\n${url}`).digest('hex')}`;
}

export async function ingestWebSource(source, { fetchPageImpl = fetchPublicPublisherPage } = {}) {
  if (!source?.id || !isHeadlinePartner(source) || !source.url) throw new Error('Fonte publisher inválida');
  const config = sourceConfig(source);
  try {
    const fetched = await fetchPageImpl(source.url, { deadlineAt:Date.now() + PAGE_TIMEOUT_MS });
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
    ? await q(`SELECT * FROM radar_sources WHERE id=$1 AND kind='partner' AND config->>'adapter'='headline-links'`, [sourceId])
    : await q(`SELECT * FROM radar_sources WHERE active=true AND kind='partner' AND config->>'adapter'='headline-links' ORDER BY COALESCE(last_fetched_at,'-infinity') ASC`);
  const result = { attempted:sources.length, succeeded:0, failed:0, items:0 };
  for (const source of sources) {
    try {
      const out = await ingestWebSource(source);
      result.succeeded += 1;
      result.items += out.touched || 0;
    } catch (error) {
      result.failed += 1;
      console.warn(`[radar] publisher ${source.name}: ${error.message}`);
    }
  }
  return result;
}
