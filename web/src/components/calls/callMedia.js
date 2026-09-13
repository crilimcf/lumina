export function callMediaConstraints(mode) {
  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: mode === 'video' ? {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 },
    } : false,
  };
}

export async function acquireCallMedia(mode, mediaDevices = globalThis.navigator?.mediaDevices) {
  if (!mediaDevices?.getUserMedia) {
    throw new Error('Este dispositivo/browser não permite chamadas WebRTC.');
  }
  return mediaDevices.getUserMedia(callMediaConstraints(mode));
}

export function stopCallMedia(stream) {
  stream?.getTracks?.().forEach(track => {
    try { track.stop(); } catch {}
  });
}

export function hasLiveCallMedia(stream) {
  return !!stream?.getTracks?.().some(track => track.readyState !== 'ended');
}
