function getAudioSession(navigatorLike = globalThis.navigator) {
  try {
    return navigatorLike?.audioSession || null;
  } catch {
    return null;
  }
}

function setAudioSessionType(type, navigatorLike = globalThis.navigator) {
  const session = getAudioSession(navigatorLike);
  if (!session) return false;
  try {
    session.type = type;
    return true;
  } catch {
    return false;
  }
}

// Start from the system default before opening the microphone. WebKit can keep
// an audio route from an earlier media session, especially in an installed PWA.
export function prepareCallAudioSession(navigatorLike = globalThis.navigator) {
  return setAudioSessionType('auto', navigatorLike);
}

// On iOS/WebKit, re-applying play-and-record after getUserMedia is the best
// available web-level hint for phone-call routing (receiver/headset) instead
// of leaving a previous playback/speaker route active.
export function preferCallReceiver(navigatorLike = globalThis.navigator) {
  return setAudioSessionType('play-and-record', navigatorLike);
}

// Do not leave the whole PWA in call-quality audio after hanging up.
export function resetCallAudioSession(navigatorLike = globalThis.navigator) {
  const session = getAudioSession(navigatorLike);
  if (!session) return false;
  try {
    session.type = 'playback';
    session.type = 'auto';
    return true;
  } catch {
    return false;
  }
}
