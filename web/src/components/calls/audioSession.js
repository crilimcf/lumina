const activeCallSessions = new WeakSet();

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

// Before opening the microphone, return WebKit to its neutral routing state.
// Once a call has already moved to play-and-record we deliberately do not go
// back to auto: doing so while the microphone is live can make iOS jump back
// to the loudspeaker.
export function prepareCallAudioSession(navigatorLike = globalThis.navigator) {
  const session = getAudioSession(navigatorLike);
  if (!session) return false;
  if (activeCallSessions.has(session)) return true;
  return setAudioSessionType('auto', navigatorLike);
}

// On iOS/WebKit the reliable order is auto -> getUserMedia -> play-and-record.
// Mark the session active so later React mounts/re-renders never reset it to
// auto while the call is already using the receiver/headset route.
export function preferCallReceiver(navigatorLike = globalThis.navigator) {
  const session = getAudioSession(navigatorLike);
  if (!session) return false;
  try {
    session.type = 'play-and-record';
    activeCallSessions.add(session);
    return true;
  } catch {
    return false;
  }
}

// Do not leave the whole PWA in call-quality audio after hanging up.
export function resetCallAudioSession(navigatorLike = globalThis.navigator) {
  const session = getAudioSession(navigatorLike);
  if (!session) return false;
  try {
    session.type = 'playback';
    session.type = 'auto';
    activeCallSessions.delete(session);
    return true;
  } catch {
    activeCallSessions.delete(session);
    return false;
  }
}
