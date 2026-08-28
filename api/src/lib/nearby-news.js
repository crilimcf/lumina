import { fetchPublicFeed, parseSyndicationFeed } from '../jobs/radar.js';

const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX_ENTRIES = 100;
const cache = new Map();
const inFlight = new Map();
const LANGUAGE_BY_COUNTRY = Object.freeze({
  pt:'pt-PT', fr:'fr', es:'es', gb:'en-GB', us:'en-US', br:'pt-BR', de:'de', it:'it',
});

function googleNewsUrl(country, region) {
  const cc = String(country || '').trim().toUpperCase();
  const locale = LANGUAGE_BY_COUNTRY[cc.toLowerCase()] || 'en';
  const lang = locale.split('-')[0];
  const url = new URL('https://news.google.com/rss/search');
  url.searchParams.set('q', `"${String(region || '').trim()}"`);
  url.searchParams.set('hl', locale);
  url.searchParams.set('gl', cc);
  url.searchParams.set('ceid', `${cc}:${lang}`);
  return url.toString();
}

function pruneCache(now = Date.now()) {
  for (const [key, value] of cache) {
    if (!value || now - value.at >= CACHE_TTL_MS) cache.delete(key);
  }
  while (cache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

async function fetchNearbyBatch(cleanCountry, cleanRegion) {
  const fetched = await fetchPublicFeed(googleNewsUrl(cleanCountry, cleanRegion));
  return parseSyndicationFeed(fetched.text)
    .filter(entry => entry.externalUrl && entry.title)
    .slice(0, 30)
    .map((entry, index) => ({
      id:`nearby-live:${cleanCountry}:${encodeURIComponent(cleanRegion)}:${index}`,
      type:'news',
      title:entry.title,
      summary:entry.summary || '',
      body:'',
      image_url:null,
      external_url:entry.externalUrl,
      source_name:`Google News · ${cleanRegion}`,
      source_url:'https://news.google.com/',
      sponsored:false,
      sponsor_label:null,
      tags:[`country:${cleanCountry}`, `nearby:${cleanRegion.toLocaleLowerCase('en-US')}`],
      region:cleanRegion,
      starts_at:null,
      ends_at:null,
      published_at:entry.publishedAt || new Date().toISOString(),
      priority:0,
    }));
}

export async function loadNearbyNews({ country, region, limit = 20 } = {}) {
  if (process.env.NODE_ENV !== 'production') return [];
  const cleanCountry = String(country || '').trim().toLowerCase();
  const cleanRegion = String(region || '').trim().slice(0, 80);
  if (!/^[a-z]{2}$/.test(cleanCountry) || !cleanRegion) return [];

  const safeLimit = Math.min(30, Math.max(1, Number(limit) || 20));
  const key = `${cleanCountry}:${cleanRegion.toLocaleLowerCase('en-US')}`;
  const now = Date.now();
  const previous = cache.get(key);
  if (previous && now - previous.at < CACHE_TTL_MS) return previous.items.slice(0, safeLimit);
  if (previous) cache.delete(key);

  let pending = inFlight.get(key);
  if (!pending) {
    pending = fetchNearbyBatch(cleanCountry, cleanRegion)
      .then(items => {
        pruneCache();
        cache.set(key, { at:Date.now(), items });
        return items;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }

  const items = await pending;
  return items.slice(0, safeLimit);
}
