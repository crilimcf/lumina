import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const card = { background:'#141c2b', color:'#f4f8ff', border:'1px solid rgba(148,179,205,.20)', borderRadius:24, padding:'22px 20px', marginBottom:18, boxShadow:'0 16px 38px rgba(3,11,27,.14)' };
const field = { width:'100%', minHeight:48, padding:'12px 14px', borderRadius:12, border:'1px solid rgba(156,177,207,.38)', background:'#111827', color:'#f4f8ff', boxSizing:'border-box', marginTop:8, fontSize:16 };
const button = { border:0, borderRadius:14, padding:'13px 20px', fontWeight:800, cursor:'pointer', background:'#31dacb', color:'#09232e', minHeight:48, boxShadow:'0 8px 22px rgba(49,218,203,.17)' };
const muted = { color:'#b6c6da', lineHeight:1.5 };
const labelStyle = { display:'block', marginTop:14, color:'#e9f1fb', fontWeight:650 };

export function CreatorStudio({ onBack }) {
  const [plans,setPlans] = useState([]);
  const [content,setContent] = useState([]);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [title,setTitle] = useState('');
  const [price,setPrice] = useState('5');
  const [period,setPeriod] = useState('month');
  const [postTitle,setPostTitle] = useState('');
  const [body,setBody] = useState('');
  const [unavailable,setUnavailable] = useState(false);
  const [notice,setNotice] = useState('');

  const load = async () => {
    try {
      const [p,c] = await Promise.all([api.creators.myPlans(),api.creators.myContent()]);
      setPlans(p.plans || []);
      setContent(c.content || []);
      setError('');
    } catch (e) {
      if (e.code === 'feature_off' || e.status === 404) setUnavailable(true);
      else setError(e.message);
    }
  };
  useEffect(() => { void load(); }, []);
  const submit = async fn => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); await load(); setNotice('Guardado com sucesso.'); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return <main style={{minHeight:'100dvh',padding:'max(24px, env(safe-area-inset-top)) 18px max(52px, env(safe-area-inset-bottom))',maxWidth:680,margin:'auto',color:'#f4f8ff'}}>
    <button type="button" onClick={onBack} style={{...button,background:'transparent',color:'#c5d5e9',paddingLeft:0,boxShadow:'none'}}>← Voltar</button>
    <h1 style={{fontSize:'clamp(30px, 7vw, 42px)',letterSpacing:'-.05em',margin:'16px 0 8px',lineHeight:1.1}}>Lumina <span style={{color:'#31dacb'}}>Creators</span></h1>
    <p style={{...muted,marginBottom:26}}>Cria. Partilha. Faz crescer a tua comunidade.</p>
    {unavailable ? <section style={card}><h2>Em preparação</h2><p>O estúdio será ativado depois de concluirmos a segurança e os pagamentos.</p></section> : <>
      {error && <p role="alert" style={{color:'#ffb8ae'}}>{error}</p>}
      {notice && <p role="status" style={{color:'#7eeddf',marginBottom:14}}>{notice}</p>}
      <section style={card}>
        <h2>Planos de comunidade</h2>
        <p style={{...muted,fontSize:14,margin:'10px 0 18px'}}>Define o valor e a periodicidade da tua comunidade. A ativação das subscrições depende da verificação de pagamentos e segurança.</p>
        <form onSubmit={e=>{e.preventDefault();void submit(async()=>{await api.creators.createPlan({title,price_cents:Math.round(Number(price)*100),billing_period:period});setTitle('');});}}>
          <label style={labelStyle}>Nome do plano<input required minLength={3} maxLength={80} value={title} onChange={e=>setTitle(e.target.value)} style={field}/></label>
          <label style={labelStyle}>Preço em euros<input required type="number" min="1" max="1000" step=".01" value={price} onChange={e=>setPrice(e.target.value)} style={field}/></label>
          <label style={labelStyle}>Periodicidade<select value={period} onChange={e=>setPeriod(e.target.value)} style={field}><option value="month">Mensal</option><option value="year">Anual</option></select></label>
          <button disabled={busy} style={{...button,marginTop:20,opacity:busy ? 0.6 : 1}}>Guardar plano</button>
        </form>
        {plans.map(p=><div key={p.id} style={{padding:'12px 0',borderTop:'1px solid #9993',marginTop:12}}><strong>{p.title}</strong> · {(p.price_cents/100).toFixed(2)} €/{p.billing_period==='month'?'mês':'ano'} <small style={{color:'#b6c6da'}}>({p.status==='draft'?'em configuração':p.status==='published'?'publicado':'arquivado'})</small></div>)}
      </section>
      <section style={card}>
        <h2>Conteúdo exclusivo</h2>
        <form onSubmit={e=>{e.preventDefault();void submit(async()=>{await api.creators.createContent({title:postTitle,body});setPostTitle('');setBody('');});}}>
          <label style={labelStyle}>Título<input required minLength={3} maxLength={160} value={postTitle} onChange={e=>setPostTitle(e.target.value)} style={field}/></label>
          <label style={labelStyle}>Mensagem<textarea value={body} maxLength={10000} rows={5} onChange={e=>setBody(e.target.value)} style={field}/></label>
          <button disabled={busy} style={{...button,marginTop:20,opacity:busy ? 0.6 : 1}}>Guardar conteúdo</button>
        </form>
        {content.map(item=><article key={item.id} style={{padding:'14px 0',borderTop:'1px solid #9993',marginTop:12}}>
          <strong>{item.title}</strong><p style={{whiteSpace:'pre-wrap'}}>{item.body}</p>
          <small style={muted}>{item.status==='published'?'Conteúdo preparado para membros':'Em configuração'}</small>
          {item.status==='draft' && <div><button disabled={busy} style={{...button,marginTop:10}} onClick={()=>void submit(()=>api.creators.publishContent(item.id))}>Preparar conteúdo para membros</button></div>}
        </article>)}
      </section>
    </>}
    <footer style={{display:'flex',gap:18,flexWrap:'wrap',fontSize:13,marginTop:22,marginBottom:16}}><a href="/privacidade.html" style={{color:'#85e5dc'}}>Privacidade e RGPD</a><a href="/legal/TERMOS.md" style={{color:'#85e5dc'}}>Termos de utilização</a></footer>
  </main>;
}
