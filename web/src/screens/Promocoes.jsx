import React, { useEffect, useState } from 'react';
import { BadgePercent, ExternalLink, ShieldCheck } from 'lucide-react';
import { api } from '../api.js';
import { Empty, Orb } from '../ui.jsx';
import { Nav, Toast } from '../components/AppChrome.jsx';

export function Promocoes({ tab, setTab, coms, setComp, threads, setThread, ping, toast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.posts.promotions().then(r => setItems(r.posts || [])).catch(e => ping(e.message)).finally(() => setLoading(false));
  }, []);

  return <div style={{ minHeight: '100dvh', paddingBottom: 100, background: 'linear-gradient(180deg,#F5F1FF,#E9E7F8)' }}>
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '20px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 8px' }}>
        <span style={{ width: 50, height: 50, borderRadius: 18, background: 'linear-gradient(135deg,#FF6859,#794EFF)', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 12px 28px rgba(98,70,220,.2)' }}><BadgePercent size={24} /></span>
        <div><h2 className="d" style={{ fontSize: 38, margin: 0 }}>Promo<span className="it">ções</span></h2><div className="m">Publicidade tem casa própria.</div></div>
      </div>
      <div className="card" style={{ padding: 15, margin: '14px 0 18px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <ShieldCheck size={20} color="var(--cobalt)" style={{ marginTop: 1 }} />
        <div style={{ fontSize: 13, lineHeight: 1.45 }}><b>O feed social fica limpo.</b> Ofertas, campanhas e conteúdo patrocinado aparecem apenas aqui e são sempre identificados.</div>
      </div>
      {loading ? <div className="m" style={{ padding: 30, textAlign: 'center' }}>A carregar…</div> : !items.length ? <Empty>Ainda não há promoções.<br />Quando existirem, ficam aqui — nunca misturadas com os teus posts.</Empty> : <div style={{ display: 'grid', gap: 13 }}>{items.map(p => <article key={p.id} className="card in" style={{ overflow: 'hidden', padding: 0 }}>
        {p.media_url && (p.media_mime?.startsWith('video/') ? <video src={p.media_url} controls playsInline style={{ width: '100%', maxHeight: '64dvh', background: '#080711' }} /> : <img src={p.media_url} alt="" style={{ width: '100%', aspectRatio: '4/5', objectFit: 'cover', display: 'block' }} />)}
        <div style={{ padding: 15 }}><div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}><Orb p={p.author_palette} avatarUrl={p.author_avatar_url} s={34} /><div style={{ flex: 1 }}><b style={{ fontSize: 14 }}>{p.name}</b><div className="m">Patrocinado · {p.community_name}</div></div><BadgePercent size={17} color="#8A79C7" /></div><div style={{ fontSize: 15.5, lineHeight: 1.45 }}>{p.body}</div></div>
      </article>)}</div>}
    </div>
    <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} coms={coms} threads={threads} ping={ping} />
    <Toast text={toast} />
  </div>;
}
