import { Geolocation } from '@capacitor/geolocation';
import { isNativeApp } from './session.js';

let nextWatchId = 1;
const watches = new Map();

const pluginOptions = options => ({
  enableHighAccuracy:!!options?.enableHighAccuracy,
  timeout:Number.isFinite(options?.timeout) ? options.timeout : 10_000,
  maximumAge:Number.isFinite(options?.maximumAge) ? options.maximumAge : 0,
});

const standardPosition = position => ({
  coords:{
    latitude:position.coords.latitude,
    longitude:position.coords.longitude,
    accuracy:position.coords.accuracy,
    altitude:position.coords.altitude ?? null,
    altitudeAccuracy:position.coords.altitudeAccuracy ?? null,
    heading:position.coords.heading ?? null,
    speed:position.coords.speed ?? null,
  },
  timestamp:position.timestamp || Date.now(),
});

const standardError = error => {
  const message = String(error?.message || 'Não foi possível obter a localização.');
  const normalized = `${error?.code || ''} ${message}`.toLowerCase();
  const code = normalized.includes('denied') || normalized.includes('permission') ? 1
    : normalized.includes('timeout') ? 3 : 2;
  return {
    code,
    message,
    PERMISSION_DENIED:1,
    POSITION_UNAVAILABLE:2,
    TIMEOUT:3,
  };
};

export function installNativeGeolocationBridge() {
  if (!isNativeApp) return;
  const bridge = {
    getCurrentPosition(success, failure, options) {
      Geolocation.getCurrentPosition(pluginOptions(options))
        .then(position => success?.(standardPosition(position)))
        .catch(error => failure?.(standardError(error)));
    },
    watchPosition(success, failure, options) {
      const localId = nextWatchId++;
      const state = { cancelled:false, pluginId:null };
      watches.set(localId, state);
      Geolocation.watchPosition(pluginOptions(options), (position, error) => {
        if (state.cancelled) return;
        if (error || !position) failure?.(standardError(error));
        else success?.(standardPosition(position));
      }).then(pluginId => {
        state.pluginId = pluginId;
        if (state.cancelled) Geolocation.clearWatch({ id:pluginId }).catch(() => {});
      }).catch(error => failure?.(standardError(error)));
      return localId;
    },
    clearWatch(localId) {
      const state = watches.get(localId);
      if (!state) return;
      state.cancelled = true;
      watches.delete(localId);
      if (state.pluginId) Geolocation.clearWatch({ id:state.pluginId }).catch(() => {});
    },
  };

  try {
    Object.defineProperty(navigator, 'geolocation', { configurable:true, value:bridge });
  } catch {
    // Older WebViews may expose a non-configurable implementation; Capacitor
    // still handles the platform permission for that native WebView API.
  }
}
