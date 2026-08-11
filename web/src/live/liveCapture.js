function currentOrientation() {
  const viewport = globalThis.visualViewport;
  const width = viewport?.width || globalThis.innerWidth || 0;
  const height = viewport?.height || globalThis.innerHeight || 0;
  return width > height ? 'landscape' : 'portrait';
}

function outputSize(orientation) {
  return orientation === 'landscape'
    ? { width: 1280, height: 720 }
    : { width: 720, height: 1280 };
}

function cameraConstraints(facingMode, orientation) {
  const { width, height } = outputSize(orientation);
  return {
    facingMode: { ideal: facingMode },
    width: { ideal: width },
    height: { ideal: height },
    aspectRatio: { ideal: width / height },
    frameRate: { ideal: 30, max: 30 },
  };
}

function drawCover(context, source, width, height) {
  const sourceWidth = source.videoWidth || width;
  const sourceHeight = source.videoHeight || height;
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = width / height;

  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;

  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx = (sourceWidth - sw) / 2;
  } else if (sourceRatio < targetRatio) {
    sh = sourceWidth / targetRatio;
    sy = (sourceHeight - sh) / 2;
  }

  context.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);
}

async function openCamera(facingMode, orientation, includeAudio) {
  return navigator.mediaDevices.getUserMedia({
    video: cameraConstraints(facingMode, orientation),
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
  const sourceStream = await openCamera(facingMode, orientation, true);
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
  const render = () => {
    if (stopped) return;
    if (sourceVideo.readyState >= 2) {
      context.fillRect(0, 0, width, height);
      drawCover(context, sourceVideo, width, height);
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

  return {
    stream: outputStream,
    orientation,
    facingMode,
    width,
    height,
    async switchCamera(nextFacingMode) {
      if (stopped || nextFacingMode === facingMode) return facingMode;
      const nextStream = await openCamera(nextFacingMode, orientation, false);
      const nextTrack = nextStream.getVideoTracks()[0] || null;
      if (!nextTrack) {
        nextStream.getTracks().forEach(track => track.stop());
        throw new Error('Não foi possível trocar de câmara.');
      }

      const previousTrack = cameraTrack;
      cameraTrack = nextTrack;
      facingMode = nextFacingMode;
      sourceVideo.srcObject = new MediaStream([nextTrack]);
      await sourceVideo.play();
      previousTrack?.stop();
      nextStream.getAudioTracks().forEach(track => track.stop());
      return facingMode;
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
