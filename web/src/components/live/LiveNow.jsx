import React, { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { api } from '../../api.js';
import '../../live-facelift.css';

export function LiveNow({ onOpen }) {
  const [streams, setStreams] = useState([]);

  useEffect(() => {
    let alive = true;
    const load = () => api.live.list().then(rows => { if (alive) setStreams(Array.isArray(rows) ? rows : []); }).catch(() => {});
    load();
    const timer = setInterval(load, 15_000);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  if (!streams.length) return null;

  return <section className="live-now-section" aria-label="Diretos agora">
    <div className="live-now-heading"><strong>Diretos agora</strong><span>Em tempo real</span></div>
    <div className="live-now-rail">
      {streams.map(stream => <button key={stream.id} className="live-now-card" onClick={()=>onOpen?.(stream.id)} aria-label={`Ver direto de ${stream.name || stream.handle}: ${stream.title}`}>
        <span className="live-now-avatar-wrap">
          {stream.avatar_url?<img className="live-now-avatar" src={stream.avatar_url} alt=""/>:<span className="live-now-avatar"/>}
          <span className="live-now-pulse"/>
        </span>
        <span style={{minWidth:0}}>
          <span className="live-now-title" style={{display:'block'}}>{stream.title}</span>
          <span className="live-now-meta" style={{display:'flex',alignItems:'center',gap:6}}>@{stream.handle} · <Users size={11}/>{stream.viewers || 0}</span>
        </span>
      </button>)}
    </div>
  </section>;
}
