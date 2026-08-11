function currentOrientation() {
  const screenOrientation = globalThis.screen?.orientation?.type;
  if (typeof screenOrientation === 'string') {
    if (screenOrientation.startsWith('landscape')) return 'landscape';
    if (screenOrientation.startsWith('portrait')) return 'portrait';
  }

  if (typeof globalThis.orientation === 'number') {
    return Math.abs(globalThis.orientation) % 180 === 90 ? 'landscape' : 'portrait';
  }

  if (globalThis.matchMedia?.('(orientation: landscape)')?.matches) return 'landscape';

  const width = globalThis.innerWidth || globalThis.screen?.width || 0;
  const height = globalThis.innerHeight || globalThis.screen?.height || 0;
  return width > height ? 'landscape' : 'portrait';
}

function outputSize(orientation) {
  return orientation === 'landscape'
    ? { width: 1280, height: 720 }
    : { width: 720, height: 1280 };
}

function cameraConstraints(facingMode) {
  return {
    facingMode: { ideal: facingMode },
    width: { ideal: 1280 },
    frameRate: { ideal: 30, max: 30 },
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || min));
}

function drawCentered(context, source, width, height, scale) {
  const sourceWidth = source.videoWidth || width;
  const sourceHeight = source.videoHeight || height;
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(
    source,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function drawProfessionalFrame(context, source, width, height, zoom) {
  const sourceWidth = source.videoWidth || width;
  const sourceHeight = source.videoHeight || height;
  if (!sourceWidth || !sourceHeight) return;

  const containScale = Math.min(width / sourceWidth, height / sourceHeight);
  const coverScale = Math.max(width / sourceWidth, height / sourceHeight);

  context.save();
  context.filter = 'blur(22px) brightness(.55) saturate(.9)';
  drawCentered(context, source, width, height, coverScale * 1.08);
  context.restore();

  const foregroundScale = containScale * clamp(zoom, 1, 3);
  context.save();
  context.filter = 'none';
  drawCentered(context, source, width, height, foregroundScale);
  context.restore();
}

async function openCamera(facingMode, includeAudio) {
  return navigator.mediaDevices.getUserMedia({
    video: cameraConstraints(facingMode),
    audio: includeAudio
      ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      : false,
  });
}

export async function createLiveCapture({ facingMode = 'user' } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Este dispositivo não disponibiliza câmara e microfone à Lumina.');
  }

  const orientation = currentOrientation();
  const { width, height } = outputSize(orientation);
  const sourceStream = await openCamera(facingMode, true);
  let cameraTrack = sourceStream.getVideoTracks()[0] || null;
  const audioTrack = sourceStream.getAudioTracks()[0] || null;

  if (!cameraTrack) {
    sourceStream.getTracks().forEach(track => track.stop());
    throw new Error('Não foi possível abrir a câmara.');
  }

  const sourceVideo = document.createElement('video');
  sourceVideo.muted = true;
  sourceVideo.playsInline = true;
  sourceVideo.autoplay = true;
  sourceVideo.srcObject = new MediaStream([cameraTrack]);
  await sourceVideo.play();

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!context || typeof canvas.captureStream !== 'function') {
    sourceStream.getTracks().forEach(track => track.stop());
    sourceVideo.srcObject = null;
    throw new Error('Este dispositivo não suporta o modo profissional de vídeo da Lumina.');
  }

  context.fillStyle = '#000';
  context.fillRect(0, 0, width, height);

  let stopped = false;
  let animationFrame = 0;
  let zoom = 1;

  const render = () => {
    if (stopped) return;
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
    if (sourceVideo.readyState >= 2 && sourceVideo.srcObject) {
      drawProfessionalFrame(context, sourceVideo, width, height, zoom);
    }
    animationFrame = requestAnimationFrame(render);
  };
  render();

  const composedVideoStream = canvas.captureStream(30);
  const composedVideoTrack = composedVideoStream.getVideoTracks()[0] || null;
  if (!composedVideoTrack) {
    stopped = true;
    cancelAnimationFrame(animationFrame);
    sourceStream.getTracks().forEach(track => track.stop());
    sourceVideo.srcObject = null;
    throw new Error('Não foi possível preparar o vídeo do direto.');
  }

  const outputStream = new MediaStream([
    composedVideoTrack,
    ...(audioTrack ? [audioTrack] : []),
  ]);

  const attachCameraTrack = async (track) => {
    cameraTrack = track;
    sourceVideo.srcObject = new MediaStream([track]);
    await sourceVideo.play();
  };

  return {
    stream: outputStream,
    orientation,
    facingMode,
    width,
    height,
    zoomRange: { min: 1, max: 3, step: 0.1 },
    getZoom() {
      return zoom;
    },
    setZoom(nextZoom) {
      zoom = Math.round(clamp(nextZoom, 1, 3) * 10) / 10;
      return zoom;
    },
    async switchCamera(nextFacingMode) {
      if (stopped || nextFacingMode === facingMode) return facingMode;

      const previousFacingMode = facingMode;
      const previousTrack = cameraTrack;
      sourceVideo.srcObject = null;
      previousTrack?.stop();
      cameraTrack = null;

      try {
        const nextStream = await openCamera(nextFacingMode, false);
        const nextTrack = nextStream.getVideoTracks()[0] || null;
        if (!nextTrack) {
          nextStream.getTracks().forEach(track => track.stop());
          throw new Error('Não foi possível abrir a outra câmara.');
        }

        await attachCameraTrack(nextTrack);
        nextStream.getAudioTracks().forEach(track => track.stop());
        facingMode = nextFacingMode;
        zoom = 1;
        return facingMode;
      } catch (switchError) {
        try {
          const rollbackStream = await openCamera(previousFacingMode, false);
          const rollbackTrack = rollbackStream.getVideoTracks()[0] || null;
          if (rollbackTrack) {
            await attachCameraTrack(rollbackTrack);
            rollbackStream.getAudioTracks().forEach(track => track.stop());
            facingMode = previousFacingMode;
          } else {
            rollbackStream.getTracks().forEach(track => track.stop());
          }
        } catch {}
        throw new Error('Não foi possível trocar de câmara. Tenta novamente.');
      }
    },
    stop() {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(animationFrame);
      cameraTrack?.stop();
      audioTrack?.stop();
      composedVideoStream.getTracks().forEach(track => track.stop());
      outputStream.getTracks().forEach(track => track.stop());
      sourceVideo.srcObject = null;
    },
  };
}
