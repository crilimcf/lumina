import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from '../../native/session.js';
import { preferCallReceiver, resetCallAudioSession } from './audioSession.js';

const AudioRoute = registerPlugin('AudioRoute');

export async function setCallAudioRoute(route = 'receiver') {
  const target = route === 'speaker' ? 'speaker' : 'receiver';

  if (isNativeApp) {
    try {
      await AudioRoute.setRoute({ route:target });
      return true;
    } catch (error) {
      console.debug('[call] native audio route', error?.message);
    }
  }

  // Web/PWA fallback: WebKit exposes only the call audio-session category,
  // not a portable speaker/earpiece selector. Keep normal voice calls on the
  // phone-call (receiver/headset) category instead of forcing loudspeaker.
  if (target === 'receiver') return preferCallReceiver();
  return false;
}

export async function resetCallAudioRoute() {
  if (isNativeApp) {
    try { await AudioRoute.reset(); } catch (error) { console.debug('[call] reset native audio route', error?.message); }
  }
  resetCallAudioSession();
}
