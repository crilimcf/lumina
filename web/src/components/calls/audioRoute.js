import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from '../../native/session.js';
import { preferCallReceiver, resetCallAudioSession } from './audioSession.js';

const AudioRoute = registerPlugin('AudioRoute');

export async function setCallAudioRoute(route = 'receiver') {
  const target = route === 'speaker' ? 'speaker' : 'receiver';

  if (isNativeApp) {
    try {
      const result = await AudioRoute.setRoute({ route:target });
      // Keep WebKit's own audio-session state aligned with the native route.
      // This also prevents a later component mount from resetting the session
      // to `auto` after the microphone has already started.
      if (target === 'receiver') preferCallReceiver();
      return result?.applied !== false;
    } catch (error) {
      console.debug('[call] native audio route', error?.message);
    }
  }

  // Web/PWA fallback: the Audio Session API cannot name the receiver as a
  // sink, but `play-and-record` after getUserMedia is iOS/WebKit's call route
  // and normally selects the receiver/headset instead of loudspeaker.
  if (target === 'receiver') return preferCallReceiver();
  return false;
}

export async function resetCallAudioRoute() {
  if (isNativeApp) {
    try { await AudioRoute.reset(); } catch (error) { console.debug('[call] reset native audio route', error?.message); }
  }
  resetCallAudioSession();
}
