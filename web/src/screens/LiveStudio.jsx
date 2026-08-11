import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Eye, Flame, Mic, MicOff, Radio, Send, Users, Video, VideoOff } from 'lucide-react';
import { api } from '../api.js';
import { createWhipPublisher } from '../live/webrtcLive.js';
import '../live-facelift.css';

function recorderMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'video/mp4;codecs=h264,aac',
    'video/mp4',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find(type => MediaRecorder.isTypeSupported?.(type)) || '';
}

function extensionFor(mime) {
  if (mime.includes('webm')) return 'webm';
  return 'mp4';
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function stopRecorder(recorder) {
  if (!recorder || recorder.state === 'inactive') return Promise.resolve();
  return new Promise(resolve => {
    const finish = () => resolve();
    recorder.addEventListener('stop', finish, { once: true });
    try { recorder.stop(); } catch { resolve(); }
  });
}

export function LiveStudio({ me, onBack, ping }) {
  const [title, setTitle] = useState('');
  const [privacy, setPrivacy] = useState('public');
  const [configured, setConfigured] = useState(null);
  const [phase, setPhase] = useState('setup');
  const [streamInfo, setStreamInfo] = useState(null);
  const [error, setError] = useState('');
  const [comments, setComments] = useState([]);
  const [counts, setCounts] = useState({ viewers: 0, likes: 0, fires: 0 });
  const [commentBody, setCommentBody] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [replayBlob, setReplayBlob] = useState(null);
  const [replayMime, setReplayMime] = useState('');
  const [replayError, setReplayError] = useState('');

  const videoRef = useRef(null);
  const localStreamRef = useRef(null);
  const publisherRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const activityCursorRef = useRef(null);
  const activeLiveIdRef = useRef(null);
  const endedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    api.live.config()
      .then(result => { if (alive) setConfigured(!!result.configured); })
      .catch(() => { if (alive) setConfigured(false); });
    return () => { alive = false; };
  }, []);

  const stopLocalMedia = useCallback(() => {
    const stream = localStreamRef.current;
    if (stream) stream.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => {
    publisherRef.current?.close?.();
    if (recorderRef.current?.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch {}
    }
    stopLocalMedia();
    if (activeLiveIdRef.current && !endedRef.current) api.live.end(activeLiveIdRef.current).catch(() => {});
  }, [stopLocalMedia]);

  useEffect(() => {
    if (phase !== 'live' || !streamInfo?.started_at) return;
    const update = () => setElapsed((Date.now() - new Date(streamInfo.started_at).getTime()) / 1000);
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [phase, streamInfo?.started_at]);

  useEffect(() => {
    if (phase !== 'live' || !streamInfo?.id) return;
    let alive = true;
    const poll = async () => {
      try {
        const activity = await api.live.activity(streamInfo.id, activityCursorRef.current);
        if (!alive) return;
        if (activity.comments?.length) {
          setComments(previous => {
            const seen = new Set(previous.map(item => item.id));
            return [...previous, ...activity.comments.filter(item => !seen.has(item.id))].slice(-100);
          });
        }
        setCounts({ viewers: activity.viewers || 0, likes: activity.likes || 0, fires: activity.fires || 0 });
        activityCursorRef.current = activity.now || new Date().toISOString();
      } catch {}
    };
    poll();
    const timer = setInterval(poll, 2000);
    return () => { alive = false; clearInterval(timer); };
  }, [phase, streamInfo?.id]);

  const begin = async () => {
    if (!title.trim() || phase !== 'setup') return;
    setError('');
    if (!configured) {
      setError('Os Diretos ainda não estão configurados neste ambiente.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Este dispositivo não disponibiliza câmara e microfone à Lumina.');
      return;
    }
    const mime = recorderMime();
    if (mime === null) {
      setError('Este dispositivo não suporta a gravação necessária para guardar o direto no perfil.');
      return;
    }

    setPhase('preparing');
    let media = null;
    let created = null;
    try {
      media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      localStreamRef.current = media;
      if (videoRef.current) {
        videoRef.current.srcObject = media;
        videoRef.current.muted = true;
        await videoRef.current.play().catch(() => {});
      }

      created = await api.live.create({ title: title.trim(), privacy });
      activeLiveIdRef.current = created.id;
      endedRef.current = false;
      const publisher = await createWhipPublisher(created.publishUrl, media);
      publisherRef.current = publisher;

      chunksRef.current = [];
      const recorder = mime
        ? new MediaRecorder(media, { mimeType: mime, videoBitsPerSecond: 850_000, audioBitsPerSecond: 64_000 })
        : new MediaRecorder(media, { videoBitsPerSecond: 850_000, audioBitsPerSecond: 64_000 });
      recorderRef.current = recorder;
      recorder.addEventListener('dataavailable', event => {
        if (event.data?.size) chunksRef.current.push(event.data);
      });
      recorder.start(4000);
      setReplayMime(recorder.mimeType || mime || 'video/mp4');

      const started = await api.live.start(created.id);
      setStreamInfo({ ...created, ...started });
      setPhase('live');
      ping?.('Estás em direto');
    } catch (failure) {
      try { if (created?.id) await api.live.end(created.id); } catch {}
      publisherRef.current?.close?.();
      publisherRef.current = null;
      if (recorderRef.current?.state !== 'inactive') {
        try { recorderRef.current.stop(); } catch {}
      }
      stopLocalMedia();
      activeLiveIdRef.current = null;
      setPhase('setup');
      setError(failure.message || 'Não foi possível iniciar o direto');
    }
  };

  const uploadReplay = useCallback(async (blob, mime) => {
    if (!blob?.size || !streamInfo?.id) throw new Error('A gravação do direto ficou vazia');
    setReplayError('');
    setPhase('uploading');
    const effectiveMime = mime || blob.type || 'video/mp4';
    const file = new File([blob], `lumina-live-${streamInfo.id}.${extensionFor(effectiveMime)}`, { type: effectiveMime });
    const url = await api.upload(file);
    await api.live.replay(streamInfo.id, url, effectiveMime);
    setReplayBlob(null);
    setPhase('done');
    ping?.('Direto guardado no teu perfil');
  }, [streamInfo?.id, ping]);

  const endLive = async () => {
    if (phase !== 'live' || !streamInfo?.id) return;
    setPhase('ending');
    setError('');
    endedRef.current = true;
    try {
      await api.live.end(streamInfo.id);
    } catch (failure) {
      setError(failure.message || 'O direto terminou no dispositivo, mas a Lumina não confirmou o fecho.');
    }

    await publisherRef.current?.close?.();
    publisherRef.current = null;
    await stopRecorder(recorderRef.current);
    stopLocalMedia();
    activeLiveIdRef.current = null;

    const effectiveMime = replayMime || recorderRef.current?.mimeType || 'video/mp4';
    const blob = new Blob(chunksRef.current, { type: effectiveMime });
    chunksRef.current = [];
    recorderRef.current = null;
    setReplayBlob(blob);
    try {
      await uploadReplay(blob, effectiveMime);
    } catch (failure) {
      setPhase('replay-failed');
      setReplayError(failure.message || 'O direto terminou, mas a gravação ainda não foi publicada.');
    }
  };

  const toggleMic = () => {
    const tracks = localStreamRef.current?.getAudioTracks() || [];
    const next = !micOn;
    tracks.forEach(track => { track.enabled = next; });
    setMicOn(next);
  };

  const toggleCamera = () => {
    const tracks = localStreamRef.current?.getVideoTracks() || [];
    const next = !cameraOn;
    tracks.forEach(track => { track.enabled = next; });
    setCameraOn(next);
  };

  const sendComment = async (event) => {
    event.preventDefault();
    const body = commentBody.trim();
    if (!body || !streamInfo?.id) return;
    setCommentBody('');
    try {
      const comment = await api.live.comment(streamInfo.id, body);
      setComments(previous => [...previous, comment].slice(-100));
    } catch (failure) {
      ping?.(failure.message || 'Não foi possível comentar');
    }
  };

  const canBack = ['setup', 'done', 'replay-failed'].includes(phase);
  const live = phase === 'live' || phase === 'ending';

  return <div className="lumina-live-shell">
    <main className="live-page">
      <header className="live-header">
        <button className="live-back" onClick={onBack} disabled={!canBack} aria-label="Voltar"><ArrowLeft size={18}/></button>
        <div className="live-header-copy">
          <div className="live-eyebrow">Lumina Live</div>
          <h1 className="live-title">{live ? 'Estás em direto' : 'Criar direto'}</h1>
        </div>
        {live && <span className="live-badge live-badge-live"><span className="live-dot"/>AO VIVO</span>}
      </header>

      {phase === 'setup' && <section className="live-card live-setup">
        <div>
          <div className="live-meta-title">A tua luz, em tempo real.</div>
          <div className="live-hint" style={{marginTop:5}}>Dá um título, escolhe quem pode assistir e a Lumina guarda automaticamente o replay no teu perfil quando terminares.</div>
        </div>
        <label>
          <span className="live-label">Título do direto</span>
          <input value={title} onChange={event=>setTitle(event.target.value)} maxLength={140} placeholder="Sobre o que vais falar?" autoFocus/>
        </label>
        <label>
          <span className="live-label">Quem pode assistir</span>
          <select value={privacy} onChange={event=>setPrivacy(event.target.value)}>
            <option value="public">Toda a Lumina</option>
            <option value="followers">Só quem te segue</option>
          </select>
        </label>
        {configured === false && <div className="live-provider-note">Os Diretos já estão implementados na Lumina, mas este ambiente ainda precisa das credenciais Cloudflare Stream para emitir vídeo.</div>}
        {error && <div className="live-provider-note" role="alert">{error}</div>}
        <button className="live-primary" onClick={begin} disabled={!title.trim() || configured !== true}>
          <Radio size={17} style={{verticalAlign:-3,marginRight:8}}/>Começar direto
        </button>
        <div className="live-hint">Ao começar, a Lumina pede acesso à câmara e ao microfone. Os teus seguidores recebem um alerta quando o direto fica ativo.</div>
      </section>}

      {phase === 'preparing' && <section className="live-card live-replay-card">
        <div className="live-replay-orb"><Radio size={25}/></div>
        <div className="live-replay-title">A preparar o direto…</div>
        <div className="live-replay-copy">A ligar a câmara, o microfone e a emissão segura.</div>
      </section>}

      {['live','ending'].includes(phase) && <>
        <section className="live-stage">
          <video ref={videoRef} autoPlay muted playsInline aria-label="Pré-visualização do teu direto"/>
          <div className="live-stage-top">
            <span className="live-badge live-badge-live"><span className="live-dot"/>AO VIVO</span>
            <span className="live-badge">{formatDuration(elapsed)}</span>
            <span className="live-badge"><Eye size={13}/>{counts.viewers}</span>
          </div>
          <div className="live-stage-bottom">
            <div className="live-control-row">
              <button className={`live-control${micOn?'':' live-control-off'}`} onClick={toggleMic} aria-label={micOn?'Desligar microfone':'Ligar microfone'}>{micOn?<Mic size={18}/>:<MicOff size={18}/>}</button>
              <button className={`live-control${cameraOn?'':' live-control-off'}`} onClick={toggleCamera} aria-label={cameraOn?'Desligar câmara':'Ligar câmara'}>{cameraOn?<Video size={18}/>:<VideoOff size={18}/>}</button>
            </div>
            <button className="live-end" onClick={endLive} disabled={phase==='ending'}>{phase==='ending'?'A terminar…':'Terminar'}</button>
          </div>
        </section>
        <section className="live-card live-meta-card">
          <div className="live-meta-title">{streamInfo?.title}</div>
          <div className="live-meta-sub">{privacy==='followers'?'Só seguidores':'Público'} · @{me?.handle}</div>
          <div className="live-counts">
            <span className="live-count"><Users size={13}/>{counts.viewers} a ver</span>
            <span className="live-count">♥ {counts.likes}</span>
            <span className="live-count"><Flame size={13}/>{counts.fires}</span>
          </div>
        </section>
        <section className="live-card live-activity-card">
          <div className="live-label">Conversa em direto</div>
          <div className="live-comments" aria-live="polite">
            {comments.length===0?<div className="live-hint">Os comentários vão aparecer aqui.</div>:comments.map(comment=><div className="live-comment" key={comment.id}>
              {comment.avatar_url?<img className="live-comment-avatar" src={comment.avatar_url} alt=""/>:<div className="live-comment-avatar"/>}
              <div><div className="live-comment-name">{comment.name || comment.handle}</div><div className="live-comment-body">{comment.body}</div></div>
            </div>)}
          </div>
          <form className="live-comment-form" onSubmit={sendComment}>
            <input className="live-comment-input" value={commentBody} onChange={event=>setCommentBody(event.target.value)} maxLength={500} placeholder="Escrever comentário…" aria-label="Comentário no direto"/>
            <button className="live-send" type="submit" disabled={!commentBody.trim()} aria-label="Enviar comentário"><Send size={17}/></button>
          </form>
        </section>
      </>}

      {['ending','uploading'].includes(phase) && <section className="live-card live-replay-card">
        <div className="live-replay-orb"><Radio size={25}/></div>
        <div className="live-replay-title">{phase==='uploading'?'A guardar no teu perfil…':'A fechar o direto…'}</div>
        <div className="live-replay-copy">A transmissão já não fica aberta. Estamos apenas a terminar a gravação e a publicação do replay.</div>
      </section>}

      {phase === 'replay-failed' && <section className="live-card live-replay-card">
        <div className="live-replay-orb"><Video size={25}/></div>
        <div className="live-replay-title">O direto terminou.</div>
        <div className="live-replay-copy">{replayError || 'A gravação ainda não conseguiu chegar ao teu perfil.'}</div>
        <button className="live-primary" onClick={()=>uploadReplay(replayBlob,replayMime).catch(failure=>{setPhase('replay-failed');setReplayError(failure.message||'Não foi possível publicar a gravação')})} disabled={!replayBlob}>Tentar guardar novamente</button>
        <button className="live-secondary" onClick={onBack}>Voltar à Lumina</button>
      </section>}

      {phase === 'done' && <section className="live-card live-replay-card">
        <div className="live-replay-orb"><CheckCircle2 size={26}/></div>
        <div className="live-replay-title">Direto guardado.</div>
        <div className="live-replay-copy">A gravação já é uma publicação normal no teu perfil e no Feed de quem te segue.</div>
        <button className="live-primary" onClick={onBack}>Voltar ao Feed</button>
      </section>}
    </main>
  </div>;
}
