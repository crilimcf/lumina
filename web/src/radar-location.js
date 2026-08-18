import { Geolocation } from '@capacitor/geolocation';
import { isNativeApp, nativeApiOrigin, nativeAuthHeaders } from './native/session.js';

const CACHE_KEY = 'lumina.radar.location.v1';
const CACHE_TTL_MS = 30 * 60_000;
const BASE = isNativeApp ? nativeApiOrigin : (import.meta.env.VITE_API_URL || '/api');

function safeStorage() {
  try { return window.localStorage; } catch { return null; }
}

function normalizeLocation(value) {
  if (!value || typeof value !== 'object') return null;
  const countryCode = String(value.countryCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) return null;
  const country = String(value.country || '').trim().slice(0, 100);
  const city = String(value.city || '').trim().slice(0, 100);
  const region = String(value.region || '').trim().slice(0, 100);
  const updatedAt = Number(value.updatedAt) || 0;
  const label = String(value.label || [city, country].filter(Boolean).join(', ')).trim().slice(0, 180);
  return { countryCode, country, city, region, label, updatedAt };
}

export function readCachedRadarLocation({ allowStale = true } = {}) {
  try {
    const cached = normalizeLocation(JSON.parse(safeStorage()?.getItem(CACHE_KEY) || 'null'));
    if (!cached) return null;
    if (!allowStale && Date.now() - cached.updatedAt > CACHE_TTL_MS) return null;
    return cached;
  } catch { return null; }
}

function cacheLocation(location) {
  try { safeStorage()?.setItem(CACHE_KEY, JSON.stringify(location)); } catch {}
  return location;
}

async function devicePosition() {
  if (isNativeApp) {
    const current = await Geolocation.checkPermissions().catch(() => ({ location:'prompt', coarseLocation:'prompt' }));
    if (current.location !== 'granted' && current.coarseLocation !== 'granted') {
      const granted = await Geolocation.requestPermissions({ permissions:['location','coarseLocation'] });
      if (granted.location !== 'granted' && granted.coarseLocation !== 'granted') throw new Error('location_denied');
    }
    return Geolocation.getCurrentPosition({ enableHighAccuracy:false, timeout:10_000, maximumAge:120_000 });
  }

  if (!navigator.geolocation) throw new Error('location_unavailable');
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    resolve,
    () => reject(new Error('location_denied')),
    { enableHighAccuracy:false, timeout:10_000, maximumAge:120_000 },
  ));
}

async function reverseGeocode(latitude, longitude) {
  const params = new URLSearchParams({
    format:'jsonv2',
    lat:String(latitude),
    lon:String(longitude),
    zoom:'10',
    addressdetails:'1',
    'accept-language':navigator.language || 'en',
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
      signal:controller.signal,
      headers:{ accept:'application/json' },
      referrerPolicy:'strict-origin-when-cross-origin',
    });
    if (!response.ok) throw new Error('reverse_geocode_failed');
    const data = await response.json();
    const address = data?.address || {};
    const countryCode = String(address.country_code || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error('country_unavailable');
    const city = String(
      address.city || address.town || address.village || address.municipality || address.county || ''
    ).trim();
    const region = String(address.state || address.region || address.county || '').trim();
    const country = String(address.country || '').trim();
    return normalizeLocation({
      countryCode,
      country,
      city,
      region,
      label:[city, country].filter(Boolean).join(', ') || country,
      updatedAt:Date.now(),
    });
  } finally { clearTimeout(timeout); }
}

export async function detectRadarLocation({ force = false } = {}) {
  const fresh = force ? null : readCachedRadarLocation({ allowStale:false });
  if (fresh) return fresh;

  try {
    const position = await devicePosition();
    const latitude = Number(position?.coords?.latitude);
    const longitude = Number(position?.coords?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('location_unavailable');
    const location = await reverseGeocode(latitude, longitude);
    if (!location) throw new Error('country_unavailable');
    return cacheLocation(location);
  } catch (error) {
    const fallback = readCachedRadarLocation({ allowStale:true });
    if (fallback && !force) return fallback;
    throw error;
  }
}

export async function loadRadarForLocation({ type, cursor, limit = 30, country, region } = {}) {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (cursor) params.set('before', cursor);
  if (limit) params.set('limit', String(limit));
  if (country) params.set('country', String(country).toUpperCase());
  if (region) params.set('region', String(region).slice(0, 80));

  const response = await fetch(`${BASE}/radar?${params}`, {
    credentials:'include',
    headers:{ ...nativeAuthHeaders() },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o Radar');
  return data;
}
