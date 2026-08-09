import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Archive, Plus, Radar as RadarIcon, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { api } from '../api.js';

const TYPE_OPTIONS = [
  ['news', 'Notícia'],
  ['promotion', 'Promoção'],
  ['event', 'Evento'],
  ['trend', 'Tendência'],
  ['editorial', 'Editorial Lumina'],
];

const emptyItem = {
  type: 'news', title: '', summary: '', externalUrl: '', imageUrl: '', sourceId: '',
  sponsored: false, sponsorLabel: '', startsAt: '', endsAt: '', tags: '', status: 'published', priority: 0,
};

const emptySource = { name: '', kind: 'manual', url: '', defaultType: 'news', trusted: false };

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function Field({ label, children }) {
  return <label style={{ display:'grid', gap:6 }}><span className="m" style={{ fontSize:10.5 }}>{label}</span>{children}</label>;
}

export function RadarAdmin({ onBack, ping }) {
  const [items, setItems] = useState([]);
  const [sources, setSources] = useState([]);
  const [item, setItem] = useState(emptyItem);
  const [source, setSource] = useState(emptySource);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sourceSaving, setSourceSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [managed, sourceList] = await Promise.all([api.radar.manage(), api.radar.sources()]);
      setItems(managed.items || []);
      setSources(sourceList.sources || []);
    } catch (e) { ping(e.message); }
    finally { setLoading(false); }
  }, [ping]);

  useEffect(() => { load(); }, [load]);

  const createItem = async (event) => {
    event.preventDefault();
    if (!item.title.trim()) return;
    setSaving(true);
    try {
      await api.radar.create({
        type: item.type,
        title: item.title.trim(),
        summary: item.summary.trim(),
        externalUrl: item.externalUrl.trim() || null,
        imageUrl: item.imageUrl.trim() || null,
        sourceId: item.sourceId || null,
        sponsored: item.sponsored,
        sponsorLabel: item.sponsored ? (item.sponsorLabel.trim() || null) : null,
        startsAt: toIso(item.startsAt),
        endsAt: toIso(item.endsAt),
        tags: item.tags.split(',').map(tag => tag.trim()).filter(Boolean),
        status: item.status,
        priority: Number(item.priority || 0),
      });
      setItem(emptyItem);
      ping(item.status === 'draft' ? 'Rascunho guardado' : 'Publicado no Radar');
      await load();
    } catch (e) { ping(e.message); }
    finally { setSaving(false); }
  };

  const createSource = async (event) => {
    event.preventDefault();
    if (!source.name.trim()) return;
    setSourceSaving(true);
    try {
      await api.radar.createSource({
        name: source.name.trim(), kind: source.kind, url: source.url.trim() || null,
        defaultType: source.defaultType, trusted: source.trusted,
      });
      setSource(emptySource);
      ping('Fonte adicionada');
      await load();
    } catch (e) { ping(e.message); }
    finally { setSourceSaving(false); }
  };

  const setStatus = async (row, status) => {
    try {
      await api.radar.edit(row.id, { status });
      ping(status === 'published' ? 'Conteúdo publicado' : 'Conteúdo movido para rascunho');
      await load();
    } catch (e) { ping(e.message); }
  };

  const archive = async (row) => {
    try {
      await api.radar.archive(row.id);
      ping('Conteúdo arquivado');
      await load();
    } catch (e) { ping(e.message); }
  };

  return <div style={{ minHeight:'100dvh', background:'linear-gradient(180deg,#F4F1FF,#E8E5F7)' }}>
    <main style={{ maxWidth:720, margin:'0 auto', padding:'18px 16px 42px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:11, marginBottom:18 }}>
        <button className="p" onClick={onBack} aria-label="Voltar" style={{ padding:10 }}><ArrowLeft size={17}/></button>
        <span style={{ width:44,height:44,borderRadius:16,display:'grid',placeItems:'center',background:'linear-gradient(135deg,#6E4CFF,#A445FF)',color:'#fff' }}><RadarIcon size={21}/></span>
        <div style={{ flex:1 }}><h1 className="d" style={{ fontSize:31,margin:0 }}>Gestão do Radar</h1><div className="m">Conteúdo, campanhas e fontes.</div></div>
        <button className="p" onClick={load} disabled={loading} aria-label="Atualizar"><RefreshCw size={15}/></button>
      </div>

      <div className="card" style={{ padding:14,display:'flex',gap:9,alignItems:'flex-start',marginBottom:16 }}><ShieldCheck size={19} color="var(--cobalt)"/><div style={{ fontSize:12.5,lineHeight:1.45 }}><b>Área reservada à equipa Lumina.</b> Tudo o que é patrocinado deve ser identificado como tal e as fontes externas devem ser verificadas antes de publicar.</div></div>

      <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:14,alignItems:'start' }}>
        <form className="card" onSubmit={createItem} style={{ padding:16,display:'grid',gap:11 }}>
          <div><div className="d" style={{ fontSize:23 }}>Novo sinal</div><div className="m">Publica ou prepara um item do Radar.</div></div>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:9 }}>
            <Field label="TIPO"><select value={item.type} onChange={e=>setItem(v=>({...v,type:e.target.value}))}>{TYPE_OPTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="ESTADO"><select value={item.status} onChange={e=>setItem(v=>({...v,status:e.target.value}))}><option value="published">Publicado</option><option value="draft">Rascunho</option></select></Field>
          </div>
          <Field label="TÍTULO"><input value={item.title} onChange={e=>setItem(v=>({...v,title:e.target.value}))} maxLength={180} placeholder="Título curto e claro" required/></Field>
          <Field label="RESUMO"><textarea rows={4} value={item.summary} onChange={e=>setItem(v=>({...v,summary:e.target.value}))} maxLength={1200} placeholder="O essencial, sem copiar artigos completos."/></Field>
          <Field label="FONTE"><select value={item.sourceId} onChange={e=>setItem(v=>({...v,sourceId:e.target.value}))}><option value="">Sem fonte associada</option>{sources.filter(s=>s.active).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="LINK EXTERNO"><input type="url" value={item.externalUrl} onChange={e=>setItem(v=>({...v,externalUrl:e.target.value}))} placeholder="https://…"/></Field>
          <Field label="IMAGEM EXTERNA"><input type="url" value={item.imageUrl} onChange={e=>setItem(v=>({...v,imageUrl:e.target.value}))} placeholder="https://…"/></Field>
          <Field label="TAGS"><input value={item.tags} onChange={e=>setItem(v=>({...v,tags:e.target.value}))} placeholder="tecnologia, portugal, música"/></Field>
          {(item.type==='event'||item.type==='promotion') && <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:9 }}>
            <Field label={item.type==='event'?'DATA DO EVENTO':'COMEÇA'}><input type="datetime-local" value={item.startsAt} onChange={e=>setItem(v=>({...v,startsAt:e.target.value}))} required={item.type==='event'}/></Field>
            <Field label="TERMINA"><input type="datetime-local" value={item.endsAt} onChange={e=>setItem(v=>({...v,endsAt:e.target.value}))}/></Field>
          </div>}
          <label style={{ display:'flex',alignItems:'center',gap:9,fontSize:13,fontWeight:700 }}><input type="checkbox" checked={item.sponsored} onChange={e=>setItem(v=>({...v,sponsored:e.target.checked}))} style={{ width:18,height:18 }}/><span>Conteúdo patrocinado</span></label>
          {item.sponsored && <Field label="PARCEIRO / PATROCINADOR"><input value={item.sponsorLabel} onChange={e=>setItem(v=>({...v,sponsorLabel:e.target.value}))} maxLength={120} placeholder="Nome da marca ou parceiro"/></Field>}
          <Field label="PRIORIDADE 0–100"><input type="number" min="0" max="100" value={item.priority} onChange={e=>setItem(v=>({...v,priority:e.target.value}))}/></Field>
          <button className="p p-brand" type="submit" disabled={saving||!item.title.trim()} style={{ justifyContent:'center',padding:13 }}><Send size={15}/>{saving?'A guardar…':item.status==='draft'?'Guardar rascunho':'Publicar no Radar'}</button>
        </form>

        <form className="card" onSubmit={createSource} style={{ padding:16,display:'grid',gap:11 }}>
          <div><div className="d" style={{ fontSize:23 }}>Nova fonte</div><div className="m">Parceiro, RSS, API ou fonte editorial.</div></div>
          <Field label="NOME"><input value={source.name} onChange={e=>setSource(v=>({...v,name:e.target.value}))} maxLength={120} placeholder="Nome da fonte" required/></Field>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:9 }}>
            <Field label="ORIGEM"><select value={source.kind} onChange={e=>setSource(v=>({...v,kind:e.target.value}))}><option value="manual">Manual</option><option value="rss">RSS</option><option value="api">API</option><option value="partner">Parceiro</option></select></Field>
            <Field label="TIPO PADRÃO"><select value={source.defaultType} onChange={e=>setSource(v=>({...v,defaultType:e.target.value}))}>{TYPE_OPTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field>
          </div>
          <Field label="URL"><input type="url" value={source.url} onChange={e=>setSource(v=>({...v,url:e.target.value}))} placeholder="https://…" required={source.kind==='rss'}/></Field>
          <label style={{ display:'flex',alignItems:'center',gap:9,fontSize:13,fontWeight:700 }}><input type="checkbox" checked={source.trusted} onChange={e=>setSource(v=>({...v,trusted:e.target.checked}))} style={{ width:18,height:18 }}/><span>Fonte verificada</span></label>
          <button className="p" type="submit" disabled={sourceSaving||!source.name.trim()} style={{ justifyContent:'center' }}><Plus size={15}/>{sourceSaving?'A adicionar…':'Adicionar fonte'}</button>

          <div style={{ borderTop:'1px solid var(--edge)',paddingTop:12,display:'grid',gap:7 }}><div className="m">FONTES REGISTADAS · {sources.length}</div>{sources.length===0?<div className="m">Ainda não há fontes.</div>:sources.slice(0,12).map(s=><div key={s.id} style={{ display:'flex',gap:8,alignItems:'center',fontSize:12.5 }}><span style={{ width:8,height:8,borderRadius:99,background:s.active?'#35A853':'#AAA' }}/><div style={{ flex:1,minWidth:0 }}><b>{s.name}</b><div className="m">{s.kind.toUpperCase()} · {s.default_type}{s.trusted?' · verificada':''}</div></div></div>)}</div>
        </form>
      </div>

      <div style={{ display:'flex',alignItems:'end',gap:10,margin:'24px 2px 10px' }}><div style={{ flex:1 }}><div className="d" style={{ fontSize:25 }}>Conteúdo</div><div className="m">Últimos 100 itens, incluindo rascunhos e arquivo.</div></div><span className="p p-sm" style={{ pointerEvents:'none' }}>{items.length}</span></div>
      {loading?<div className="m" style={{ padding:24,textAlign:'center' }}>A carregar…</div>:items.length===0?<div className="card" style={{ padding:22,textAlign:'center' }}><div className="m">O Radar ainda não tem conteúdo.</div></div>:<div style={{ display:'grid',gap:9 }}>{items.map(row=><div className="card" key={row.id} style={{ padding:13,display:'grid',gap:9 }}>
        <div style={{ display:'flex',gap:9,alignItems:'flex-start' }}><div style={{ flex:1,minWidth:0 }}><div style={{ fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:'.04em',color:'var(--cobalt)' }}>{row.type} · {row.status}{row.sponsored?' · patrocinado':''}</div><div style={{ fontWeight:800,fontSize:14.5,marginTop:3 }}>{row.title}</div>{row.source_name&&<div className="m" style={{ marginTop:3 }}>{row.source_name}</div>}</div><span className="m" style={{ fontSize:10 }}>P{row.priority}</span></div>
        {row.status!=='archived'&&<div style={{ display:'flex',gap:7,flexWrap:'wrap' }}>{row.status==='draft'?<button className="p p-sm p-brand" onClick={()=>setStatus(row,'published')}><Send size={12}/>Publicar</button>:<button className="p p-sm" onClick={()=>setStatus(row,'draft')}>Rascunho</button>}<button className="p p-sm" onClick={()=>archive(row)} style={{ color:'var(--coral)' }}><Archive size={12}/>Arquivar</button></div>}
      </div>)}</div>}
    </main>
  </div>;
}
