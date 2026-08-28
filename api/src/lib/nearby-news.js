import { fetchPublicFeed, parseSyndicationFeed } from '../jobs/radar.js';

const CACHE_TTL_MS = 10 * 60_000;
const cache = new Map();
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

export async function loadNearbyNews({ country, region, limit = 20 } = {}) {
  if (process.env.NODE_ENV !== 'production') return [];
  const cleanCountry = String(country || '').trim().toLowerCase();
  const cleanRegion = String(region || '').trim().slice(0, 80);
  if (!/^[a-z]{2}$/.test(cleanCountry) || !cleanRegion) return [];

  const key = `${cleanCountry}:${cleanRegion.toLocaleLowerCase('en-US')}`;
  const previous = cache.get(key);
  if (previous && Date.now() - previous.at < CACHE_TTL_MS) return previous.items.slice(0, limit);

  const fetched = await fetchPublicFeed(googleNewsUrl(cleanCountry, cleanRegion));
  const entries = parseSyndicationFeed(fetched.text)
    .filter(entry => entry.externalUrl && entry.title)
    .slice(0, Math.min(30, Math.max(1, limit)))
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

  cache.set(key, { at:Date.now(), items:entries });
  return entries;
}
