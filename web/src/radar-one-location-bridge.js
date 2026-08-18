import { api } from './api.js';
import { detectRadarLocation, loadRadarForLocation, readCachedRadarLocation } from './radar-location.js';

// Lumina One/Agora historically used a saved free-text region while the main Radar
// now follows the device's physical country. Keep both surfaces on the same source
// of truth without persisting GPS coordinates in the Lumina account.
const originalPreferences = api.one.preferences;

async function currentRadarLocation() {
  try {
    return await detectRadarLocation();
  } catch {
    return readCachedRadarLocation();
  }
}

api.one.preferences = async (...args) => {
  const preferences = await originalPreferences(...args);
  const location = await currentRadarLocation();
  if (!location) return preferences;
  const localRegion = location.city || location.region || preferences.local_region || '';
  return { ...preferences, local_region: localRegion };
};

api.one.local = async (region) => {
  const location = await currentRadarLocation();
  if (!location?.countryCode) return { region: region || null, country: null, items: [] };

  const localRegion = location.city || location.region || region || '';
  const radar = await loadRadarForLocation({
    country: location.countryCode,
    region: localRegion || undefined,
    limit: 30,
  });

  return {
    ...radar,
    region: localRegion || radar.region || null,
    country: location.countryCode,
    items: radar.items || [],
  };
};
