import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Flame, Heart, Send, Users, Volume2 } from 'lucide-react';
import { api } from '../api.js';
import { createWhepViewer } from '../live/webrtcLive.js';
import '../live-facelift.css';

export function LiveViewer({ streamId, onBack, ping }) {
  const [stream, setStream] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [comments, setComments] = useState([]);
  const [counts, setCounts] = useState({ viewers: 0, likes: 0, fires: 0 });
  const [commentBody, setCommentBody] = useState('');
  const [needsPlay, setNeedsPlay] = useState(false);
  const videoRef = useRef(null);
  const viewerRef = useRef(null);
  const activityCursorRef = useRef(null);

  useEffect(() => {
    let alive = true;
    let heartbeatTimer = null;
    let activityTimer = null;
    let statusTimer = null;

    const connect = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await api.live.get(streamId);
        if (!alive) return;
        setStream(data);
        setCounts({ viewers: data.viewers || 0, likes: data.likes || 0, fires: data.fires || 0 });
        if (data.status !== 'live') {
          setLoading(false);
          return;
        }
        if (!data.playback_url) throw new Error('Este direto ainda não tem reprodução disponível');

        const viewer = await createWhepViewer(data.playback_url, remote => {
          if (!alive || !videoRef.current) return;
          videoRef.current.srcObject = remote;
          videoRef.current.muted = false;
          videoRef.current.play().catch(() => setNeedsPlay(true));
        });
        if (!alive) { viewer.close(); return; }
        viewerRef.current = viewer;
        setLoading(false);

        const heartbeat = async () => {
          try {
            const result = await api.live.heartbeat(streamId);
            if (alive) setCounts(previous => ({ ...previous, viewers: result.viewers || 0 }));
          } catch {}
        };
        const activity = async () => {
          try {
            const result = await api.live.activity(streamId, activityCursorRef.current);
            if (!alive) return;
            if (result.comments?.length) {
              setComments(previous => {
                const seen = new Set(previous.map(item => item.id));
                return [...previous, ...result.comments.filter(item => !seen.has(item.id))].slice(-100);
              });
            }
            setCounts({ viewers: result.viewers || 0, likes: result.likes || 0, fires: result.fires || 0 });
            activityCursorRef.current = result.now || new Date().toISOString();
          } catch {}
        };
        const refreshStatus = async () => {
          try {
            const current = await api.live.get(streamId);
            if (!alive) return;
            setStream(current);
            if (current.status !== 'live') {
              viewerRef.current?.close?.();
              viewerRef.current = null;
            }
          } catch {}
        };

        heartbeat();
        activity();
        heartbeatTimer = setInterval(heartbeat, 15_000);
        activityTimer = setInterval(activity, 2_000);
        statusTimer = setInterval(refreshStatus, 7_000);
      } catch (failure) {
        if (alive) {
          setLoading(false);
          setError(failure.message || 'Não foi possível abrir o direto');
        }
      }
    };

    connect();
    return () => {
      alive = false;
      clearInterval(heartbeatTimer);
      clearInterval(activityTimer);
      clearInterval(statusTimer);
      viewerRef.current?.close?.();
      viewerRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [streamId]);

  const sendComment = async (event) => {
    event.preventDefault();
    const body = commentBody.trim();
    if (!body || stream?.status !== 'live') return;
    setCommentBody('');
    try {
      const comment = await api.live.comment(streamId, body);
      setComments(previous => [...previous, comment].slice(-100));
    } catch (failure) {
      ping?.(failure.message || 'Não foi possível comentar');
    }
  };

  const react = async (kind) => {
    if (stream?.status !== 'live') return;
    try {
      await api.live.react(streamId, kind);
      setCounts(previous => ({
        ...previous,
        likes: previous.likes + (kind === 'like' ? 1 : 0),
        fires: previous.fires + (kind === 'fire' ? 1 : 0),
      }));
    } catch (failure) {
      ping?.(failure.message || 'Não foi possível reagir');
    }
  };

  const playWithSound = async () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    try { await video.play(); setNeedsPlay(false); }
    catch { setNeedsPlay(true); }
  };

  const ended = stream && stream.status !== 'live';

  return <div className="lumina-live-shell">
    <main className="live-page live-viewer-layout">
      <header className="live-header">
        <button className="live-back" onClick={onBack} aria-label="Voltar"><ArrowLeft size={18}/></button>
        <div className="live-header-copy">
          <div className="live-eyebrow">Lumina Live</div>
          <h1 className="live-title">{stream?.title || 'Direto'}</h1>
        </div>
        {stream?.status==='live'&&<span className="live-badge live-badge-live"><span className="live-dot"/>AO VIVO</span>}
      </header>

      {loading && <section className="live-card live-replay-card"><div className="live-replay-copy">A ligar ao direto…</div></section>}
      {error && <section className="live-card live-replay-card"><div className="live-replay-title">Não foi possível abrir.</div><div className="live-replay-copy">{error}</div><button className="live-secondary" onClick={onBack}>Voltar</button></section>}

      {!loading&&!error&&stream&&<>
        <section className="live-stage">
          <video ref={videoRef} autoPlay playsInline aria-label={`Direto de ${stream.name || stream.handle}`}/>
          <div className="live-stage-top">
            {stream.status==='live'?<span className="live-badge live-badge-live"><span className="live-dot"/>AO VIVO</span>:<span className="live-badge">TERMINOU</span>}
            <span className="live-badge"><Users size={13}/>{counts.viewers}</span>
          </div>
          {needsPlay&&stream.status==='live'&&<div className="live-stage-bottom"><button className="live-primary" onClick={playWithSound} style={{padding:'0 16px'}}><Volume2 size={17} style={{verticalAlign:-3,marginRight:7}}/>Tocar para ouvir</button></div>}
        </section>

        <div className="live-viewer-side">
          <section className="live-card live-meta-card">
            <div className="live-meta-title">{stream.title}</div>
            <div className="live-meta-sub">{stream.name} · @{stream.handle}{stream.privacy==='followers'?' · só seguidores':' · público'}</div>
            <div className="live-counts">
              <span className="live-count"><Users size={13}/>{counts.viewers} a ver</span>
              <span className="live-count">♥ {counts.likes}</span>
              <span className="live-count"><Flame size={13}/>{counts.fires}</span>
            </div>
          </section>

          {stream.status==='live'?<section className="live-card live-activity-card">
            <div className="live-label">Conversa em direto</div>
            <div className="live-comments" aria-live="polite">
              {comments.length===0?<div className="live-hint">Sê o primeiro a dizer alguma coisa.</div>:comments.map(comment=><div className="live-comment" key={comment.id}>
                {comment.avatar_url?<img className="live-comment-avatar" src={comment.avatar_url} alt=""/>:<div className="live-comment-avatar"/>}
                <div><div className="live-comment-name">{comment.name || comment.handle}</div><div className="live-comment-body">{comment.body}</div></div>
              </div>)}
            </div>
            <div className="live-reactions">
              <button className="live-reaction" onClick={()=>react('like')} aria-label="Gostar do direto"><Heart size={17}/> {counts.likes}</button>
              <button className="live-reaction" onClick={()=>react('fire')} aria-label="Enviar fogo"><Flame size={17}/> {counts.fires}</button>
            </div>
            <form className="live-comment-form" onSubmit={sendComment}>
              <input className="live-comment-input" value={commentBody} onChange={event=>setCommentBody(event.target.value)} maxLength={500} placeholder="Escrever comentário…" aria-label="Comentário no direto"/>
              <button className="live-send" type="submit" disabled={!commentBody.trim()} aria-label="Enviar comentário"><Send size={17}/></button>
            </form>
          </section>:<section className="live-card live-replay-card">
            <div className="live-replay-title">Este direto terminou.</div>
            <div className="live-replay-copy">{stream.post_id?'A gravação foi guardada no perfil do criador.':'A gravação está a ser preparada ou não ficou disponível.'}</div>
            <button className="live-secondary" onClick={onBack}>Voltar à Lumina</button>
          </section>}
        </div>
      </>}
    </main>
  </div>;
}
