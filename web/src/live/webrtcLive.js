const ICE_WAIT_MS = 5_000;

function waitForIceComplete(pc, timeoutMs = ICE_WAIT_MS) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', onChange);
      resolve();
    };
    const onChange = () => { if (pc.iceGatheringState === 'complete') finish(); };
    const timer = setTimeout(finish, timeoutMs);
    pc.addEventListener('icegatheringstatechange', onChange);
  });
}

async function negotiate(endpoint, pc) {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceComplete(pc);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/sdp' },
    body: pc.localDescription?.sdp || offer.sdp,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || `WebRTC HTTP ${response.status}`);
  }

  const answerSdp = await response.text();
  if (!answerSdp) throw new Error('O servidor de direto não devolveu SDP de resposta');
  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

  const location = response.headers.get('location');
  return location ? new URL(location, endpoint).toString() : null;
}

async function closeSession(pc, resourceUrl) {
  try {
    if (resourceUrl) await fetch(resourceUrl, { method: 'DELETE', keepalive: true });
  } catch {
    // O peer connection continua a ser fechado localmente.
  }
  try { pc.close(); } catch {}
}

export async function createWhipPublisher(endpoint, stream) {
  if (!endpoint) throw new Error('Endpoint de emissão em falta');
  const pc = new RTCPeerConnection();
  for (const track of stream.getTracks()) pc.addTrack(track, stream);

  for (const sender of pc.getSenders()) {
    if (sender.track?.kind !== 'video') continue;
    try {
      const parameters = sender.getParameters();
      parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
      parameters.encodings[0].maxBitrate = 1_500_000;
      parameters.encodings[0].maxFramerate = 30;
      await sender.setParameters(parameters);
    } catch {
      // Safari pode não aceitar todos os parâmetros antes da negociação.
    }
  }

  let resourceUrl = null;
  try {
    resourceUrl = await negotiate(endpoint, pc);
  } catch (error) {
    pc.close();
    throw error;
  }

  return {
    pc,
    close: () => closeSession(pc, resourceUrl),
  };
}

export async function createWhepViewer(endpoint, onStream) {
  if (!endpoint) throw new Error('Endpoint de reprodução em falta');
  const pc = new RTCPeerConnection();
  const remote = new MediaStream();
  let announced = false;

  pc.addTransceiver('video', { direction: 'recvonly' });
  pc.addTransceiver('audio', { direction: 'recvonly' });
  pc.addEventListener('track', (event) => {
    const incoming = event.streams?.[0];
    if (incoming) {
      for (const track of incoming.getTracks()) {
        if (!remote.getTracks().some(existing => existing.id === track.id)) remote.addTrack(track);
      }
    } else if (event.track && !remote.getTracks().some(existing => existing.id === event.track.id)) {
      remote.addTrack(event.track);
    }
    if (!announced && remote.getTracks().length) {
      announced = true;
      onStream?.(remote);
    }
  });

  let resourceUrl = null;
  try {
    resourceUrl = await negotiate(endpoint, pc);
  } catch (error) {
    pc.close();
    throw error;
  }

  return {
    pc,
    stream: remote,
    close: () => closeSession(pc, resourceUrl),
  };
}
