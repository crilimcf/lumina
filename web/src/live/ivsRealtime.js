function sdk() {
  const value = globalThis.IVSBroadcastClient;
  if (!value?.Stage || !value?.LocalStageStream || !value?.SubscribeType || !value?.StageEvents) {
    throw new Error('Amazon IVS Web Broadcast SDK não carregado');
  }
  return value;
}

function safeLeave(stage) {
  try { stage?.leave?.(); } catch {}
}

export async function createIvsPublisher(token, mediaStream) {
  if (!token) throw new Error('Token de emissão em falta');
  if (!mediaStream) throw new Error('Câmara e microfone indisponíveis');

  const { Stage, LocalStageStream, SubscribeType } = sdk();
  const audioTrack = mediaStream.getAudioTracks()[0] || null;
  const videoTrack = mediaStream.getVideoTracks()[0] || null;
  const audioStageStream = audioTrack ? new LocalStageStream(audioTrack) : null;
  const videoStageStream = videoTrack ? new LocalStageStream(videoTrack) : null;
  const publishStreams = [audioStageStream, videoStageStream].filter(Boolean);

  if (!publishStreams.length) throw new Error('Não há faixas de áudio ou vídeo para emitir');

  const strategy = {
    shouldSubscribeToParticipant() {
      return SubscribeType.NONE;
    },
    shouldPublishParticipant() {
      return true;
    },
    stageStreamsToPublish() {
      return publishStreams;
    },
  };

  const stage = new Stage(token, strategy);
  try {
    await stage.join();
  } catch (error) {
    safeLeave(stage);
    throw error;
  }

  return {
    stage,
    setMuted(kind, muted) {
      if (kind === 'audio') audioStageStream?.setMuted?.(Boolean(muted));
      if (kind === 'video') videoStageStream?.setMuted?.(Boolean(muted));
    },
    close() {
      safeLeave(stage);
    },
  };
}

export async function createIvsViewer(token, onStream) {
  if (!token) throw new Error('Token de reprodução em falta');

  const { Stage, SubscribeType, StageEvents } = sdk();
  const remote = new MediaStream();
  let announced = false;

  const strategy = {
    shouldSubscribeToParticipant(participant) {
      return participant?.isLocal ? SubscribeType.NONE : SubscribeType.AUDIO_VIDEO;
    },
    shouldPublishParticipant() {
      return false;
    },
    stageStreamsToPublish() {
      return [];
    },
  };

  const stage = new Stage(token, strategy);

  const announce = () => {
    if (!announced && remote.getTracks().length) {
      announced = true;
      onStream?.(remote);
    }
  };

  const addStreams = (_participant, streams = []) => {
    for (const stream of streams) {
      const track = stream?.mediaStreamTrack;
      if (track && !remote.getTracks().some(existing => existing.id === track.id)) remote.addTrack(track);
    }
    announce();
  };

  const removeStreams = (_participant, streams = []) => {
    for (const stream of streams) {
      const track = stream?.mediaStreamTrack;
      if (!track) continue;
      const existing = remote.getTracks().find(item => item.id === track.id);
      if (existing) remote.removeTrack(existing);
    }
  };

  stage.on(StageEvents.STAGE_PARTICIPANT_STREAMS_ADDED, addStreams);
  stage.on(StageEvents.STAGE_PARTICIPANT_STREAMS_REMOVED, removeStreams);

  try {
    await stage.join();
  } catch (error) {
    safeLeave(stage);
    throw error;
  }

  return {
    stage,
    stream: remote,
    close() {
      try { stage.off?.(StageEvents.STAGE_PARTICIPANT_STREAMS_ADDED, addStreams); } catch {}
      try { stage.off?.(StageEvents.STAGE_PARTICIPANT_STREAMS_REMOVED, removeStreams); } catch {}
      safeLeave(stage);
    },
  };
}
