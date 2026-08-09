import React, { useEffect, useState } from 'react';
import { Radar as RadarIcon, ShieldCheck } from 'lucide-react';
import { api } from '../api.js';
import { Empty, Orb } from '../ui.jsx';
import { Nav, Toast, TopActions } from '../components/AppChrome.jsx';

export function Promocoes({ tab, setTab, coms, setComp, threads, setThread, ping, toast, unreadCount }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.posts.promotions().then(r => setItems(r.posts || [])).catch(e => ping(e.message)).finally(() => setLoading(false));
  }, []);

  return <div style={{ minHeight: '100dvh', paddingBottom: 100, background: 'linear-gradient(180deg,#F5F1FF,#E9E7F8)' }}>
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '20px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 8px' }}>
        <span style={{ width: 50, height: 50, borderRadius: 18, background: 'linear-gradient(135deg,#6E4CFF,#A445FF)', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 12px 28px rgba(98,70,220,.22)', flexShrink: 0 }}><RadarIcon size={24} /></span>
        <div style={{ flex: 1, minWidth: 0 }}><h2 className="d" style={{ fontSize: 38, margin: 0 }}>Ra<span className="it">dar</span></h2><div className="m">Descobertas, campanhas e novidades.</div></div>
        <TopActions tab={tab} setTab={setTab} setThread={setThread} unreadCount={unreadCount} />
      </div>
      <div className="card" style={{ padding: 15, margin: '14px 0 18px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <ShieldCheck size={20} color="var(--cobalt)" style={{ marginTop: 1, flexShrink: 0 }} />
        <div style={{ fontSize: 13, lineHeight: 1.45 }}><b>O feed social continua limpo.</b> O Radar é a área de descoberta da Lumina: campanhas e conteúdos patrocinados vivem aqui, sempre identificados e separados das conversas.</div>
      </div>
      {loading ? <div className="m" style={{ padding: 30, textAlign: 'center' }}>A carregar Radar…</div> : !items.length ? <Empty>O Radar ainda está tranquilo.<br />Quando houver campanhas e destaques, aparecem aqui.</Empty> : <div style={{ display: 'grid', gap: 13 }}>{items.map(p => <article key={p.id} className="card in" style={{ overflow: 'hidden', padding: 0 }}>
        {p.media_url && (p.media_mime?.startsWith('video/') ? <video src={p.media_url} controls playsInline style={{ width: '100%', maxHeight: '64dvh', background: '#080711' }} /> : <img src={p.media_url} alt="" style={{ width: '100%', aspectRatio: '4/5', objectFit: 'cover', display: 'block' }} />)}
        <div style={{ padding: 15 }}><div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}><Orb p={p.author_palette} avatarUrl={p.author_avatar_url} s={34} /><div style={{ flex: 1 }}><b style={{ fontSize: 14 }}>{p.name}</b><div className="m">Patrocinado · {p.community_name}</div></div><RadarIcon size={17} color="var(--cobalt)" /></div><div style={{ fontSize: 15.5, lineHeight: 1.45 }}>{p.body}</div></div>
      </article>)}</div>}
    </div>
    <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} coms={coms} threads={threads} ping={ping} />
    <Toast text={toast} />
  </div>;
}
