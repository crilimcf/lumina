import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const card = { background:'var(--surface, #181b24)', color:'inherit', border:'1px solid rgba(150,150,150,.22)', borderRadius:18, padding:18, marginBottom:14 };
const field = { width:'100%', padding:12, borderRadius:10, border:'1px solid #9996', background:'transparent', color:'inherit', boxSizing:'border-box', marginTop:6 };
const button = { border:0, borderRadius:12, padding:'12px 16px', fontWeight:700, cursor:'pointer', background:'#ff784e', color:'#191919' };

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
    setBusy(true); setError('');
    try { await fn(); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return <main style={{minHeight:'100dvh',padding:'max(24px, env(safe-area-inset-top)) 18px 40px',maxWidth:680,margin:'auto',color:'inherit'}}>
    <button type="button" onClick={onBack} style={{...button,background:'transparent',color:'inherit',paddingLeft:0}}>← Voltar</button>
    <h1 style={{fontSize:32,margin:'14px 0 6px'}}>Lumina <span style={{color:'#ff784e'}}>Creators</span></h1>
    <p style={{opacity:.75,marginBottom:24}}>O teu espaço para criar uma comunidade mais próxima.</p>
    {unavailable ? <section style={card}><h2>Em preparação</h2><p>O estúdio será ativado depois de concluirmos a segurança e os pagamentos.</p></section> : <>
      {error && <p role="alert" style={{color:'#ff957b'}}>{error}</p>}
      <section style={card}>
        <h2>Planos de comunidade</h2>
        <p style={{opacity:.75}}>Os planos são apenas rascunhos. Ainda não é possível receber pagamentos ou aceitar subscritores.</p>
        <form onSubmit={e=>{e.preventDefault();void submit(async()=>{await api.creators.createPlan({title,price_cents:Math.round(Number(price)*100),billing_period:period});setTitle('');});}}>
          <label>Nome do plano<input required minLength={3} maxLength={80} value={title} onChange={e=>setTitle(e.target.value)} style={field}/></label>
          <label>Preço em euros<input required type="number" min="1" max="1000" step=".01" value={price} onChange={e=>setPrice(e.target.value)} style={field}/></label>
          <label>Periodicidade<select value={period} onChange={e=>setPeriod(e.target.value)} style={field}><option value="month">Mensal</option><option value="year">Anual</option></select></label>
          <button disabled={busy} style={{...button,marginTop:14}}>Guardar rascunho</button>
        </form>
        {plans.map(p=><div key={p.id} style={{padding:'12px 0',borderTop:'1px solid #9993',marginTop:12}}><strong>{p.title}</strong> · {(p.price_cents/100).toFixed(2)} €/{p.billing_period==='month'?'mês':'ano'} <small>({p.status})</small></div>)}
      </section>
      <section style={card}>
        <h2>Conteúdo exclusivo</h2>
        <form onSubmit={e=>{e.preventDefault();void submit(async()=>{await api.creators.createContent({title:postTitle,body});setPostTitle('');setBody('');});}}>
          <label>Título<input required minLength={3} maxLength={160} value={postTitle} onChange={e=>setPostTitle(e.target.value)} style={field}/></label>
          <label>Mensagem<textarea value={body} maxLength={10000} rows={5} onChange={e=>setBody(e.target.value)} style={field}/></label>
          <button disabled={busy} style={{...button,marginTop:14}}>Guardar conteúdo</button>
        </form>
        {content.map(item=><article key={item.id} style={{padding:'14px 0',borderTop:'1px solid #9993',marginTop:12}}>
          <strong>{item.title}</strong><p style={{whiteSpace:'pre-wrap'}}>{item.body}</p>
          <small>{item.status==='published'?'Preparado para membros (acesso indisponível até ativação das subscrições)':'Rascunho'}</small>
          {item.status==='draft' && <div><button disabled={busy} style={{...button,marginTop:10}} onClick={()=>void submit(()=>api.creators.publishContent(item.id))}>Preparar conteúdo para membros</button></div>}
        </article>)}
      </section>
    </>}
  </main>;
}
