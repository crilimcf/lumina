import React, { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck, BadgePercent, CalendarDays, ChevronRight, ExternalLink, Newspaper,
  Radar as RadarIcon, Settings2, ShieldCheck, Sparkles, TrendingUp,
} from 'lucide-react';
import { api } from '../api.js';
import { Empty } from '../ui.jsx';
import { Nav, Toast, TopActions } from '../components/AppChrome.jsx';

const FILTERS = [
  ['', Sparkles, 'Para ti'],
  ['news', Newspaper, 'Notícias'],
  ['promotion', BadgePercent, 'Promoções'],
  ['event', CalendarDays, 'Eventos'],
  ['trend', TrendingUp, 'Tendências'],
];

const TYPE_LABEL = {
  news: 'Notícia', promotion: 'Promoção', event: 'Evento', trend: 'Tendência', editorial: 'Lumina',
};

function formatDate(value) {
  if (!value) return '';
  try {
    const date = new Date(value);
    const now = new Date();
    const sameYear = date.getFullYear() === now.getFullYear();
    return new Intl.DateTimeFormat('pt-PT', { day:'numeric', month:'short', ...(sameYear ? {} : { year:'numeric' }) }).format(date);
  } catch { return ''; }
}

function ItemIcon({ type, size = 16 }) {
  const Icon = type === 'news' ? Newspaper : type === 'promotion' ? BadgePercent : type === 'event' ? CalendarDays : type === 'trend' ? TrendingUp : Sparkles;
  return <Icon size={size}/>;
}

function sourceInitials(name) {
  const cleaned = String(name || 'Radar').replace(/·.*$/, '').trim();
  return cleaned.split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase().slice(0,2) || 'R';
}

function PublisherMark({ name, size = 36 }) {
  return <span aria-hidden="true" style={{
    width:size,height:size,borderRadius:Math.round(size*.32),display:'grid',placeItems:'center',flexShrink:0,
    background:'linear-gradient(145deg,#15122C,#423788)',color:'#fff',fontWeight:900,fontSize:Math.max(10,size*.3),
    boxShadow:'inset 0 0 0 1px rgba(255,255,255,.13)',letterSpacing:'-.04em',
  }}>{sourceInitials(name)}</span>;
}

function SourceLine({ item }) {
  const name = item.sponsor_label || item.source_name || 'Radar Lumina';
  return <div style={{display:'flex',alignItems:'center',gap:9,minWidth:0}}>
    <PublisherMark name={name}/>
    <div style={{minWidth:0,flex:1}}>
      <div style={{display:'flex',alignItems:'center',gap:5,fontSize:12.5,fontWeight:800,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{name}{!item.sponsored&&<BadgeCheck size={14} fill="#5A45E8" color="#fff"/>}</div>
      <div className="m" style={{fontSize:9.5}}>{item.sponsored?'Parceiro identificado':'Fonte verificada'}</div>
    </div>
  </div>;
}

function RadarCard({ item, hero = false }) {
  const displayDate = item.type === 'event' ? item.starts_at : item.published_at;
  return <article className="card in" style={{
    overflow:'hidden',padding:0,borderRadius:hero?27:22,
    contentVisibility:'auto',containIntrinsicSize:hero?'620px':'430px',
    boxShadow:hero?'0 22px 55px rgba(34,24,80,.13)':'0 9px 28px rgba(34,24,80,.07)',
    border:'1px solid rgba(77,61,145,.11)',background:'rgba(255,255,255,.91)',
  }}>
    {item.image_url && <div style={{position:'relative',overflow:'hidden',background:'#DDD8F2'}}>
      <img src={item.image_url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" style={{width:'100%',aspectRatio:hero?'16/9':'16/10',objectFit:'cover',display:'block'}}/>
      <div style={{position:'absolute',inset:'45% 0 0',background:'linear-gradient(transparent,rgba(10,8,25,.5))',pointerEvents:'none'}}/>
    </div>}
    <div style={{padding:hero?18:15}}>
      <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12,flexWrap:'wrap'}}>
        <span style={{display:'inline-flex',alignItems:'center',gap:6,borderRadius:999,padding:'6px 9px',background:'#EFECFF',color:'#4B37C7',fontSize:10.5,fontWeight:850}}><ItemIcon type={item.type}/>{TYPE_LABEL[item.type] || 'Radar'}</span>
        {item.sponsored&&<span style={{borderRadius:999,padding:'6px 9px',background:'#FFF2C7',color:'#6B4D00',fontSize:10.5,fontWeight:850}}>Patrocinado</span>}
        <span className="m" style={{marginLeft:'auto',fontSize:10.5}}>{formatDate(displayDate)}</span>
      </div>
      <h3 className="d" style={{fontSize:hero?30:23,lineHeight:1.02,margin:'0 0 9px',letterSpacing:'-.035em'}}>{item.title}</h3>
      {(item.summary || item.body) && <div style={{fontSize:hero?15:14,lineHeight:1.5,color:'#403A59',display:'-webkit-box',WebkitLineClamp:hero?4:3,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{item.summary || item.body}</div>}
      <div style={{display:'flex',alignItems:'center',gap:12,marginTop:15,paddingTop:13,borderTop:'1px solid rgba(62,47,126,.10)'}}>
        <div style={{flex:1,minWidth:0}}><SourceLine item={item}/></div>
        {item.external_url&&<a href={item.external_url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir na fonte ${item.source_name || ''}`} style={{width:38,height:38,borderRadius:13,border:'1px solid rgba(70,54,137,.14)',background:'#F4F1FF',color:'#312467',display:'grid',placeItems:'center',flexShrink:0}}><ExternalLink size={15}/></a>}
      </div>
    </div>
  </article>;
}

export function Promocoes({ me, setScreen, tab, setTab, setComp, threads, setThread, ping, toast, unreadCount }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [publisher, setPublisher] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true); setPublisher('');
    api.radar.list({ type:filter || undefined, limit:30 })
      .then(r=>{if(active)setItems(r.items || [])})
      .catch(e=>{if(active)ping(e.message)})
      .finally(()=>{if(active)setLoading(false)});
    return ()=>{active=false};
  }, [filter,ping]);

  const publishers = useMemo(() => [...new Set(items.map(item=>item.source_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt')), [items]);
  const visible = publisher ? items.filter(item=>item.source_name === publisher) : items;
  const hero = visible[0] || null;
  const rest = hero ? visible.slice(1) : visible;

  return <div style={{minHeight:'100dvh',paddingBottom:102,background:'radial-gradient(circle at 15% 0,#FAF7FF 0,#EFECFA 42%,#E6E2F5 100%)'}}>
    <div style={{maxWidth:560,margin:'0 auto',padding:'17px 15px'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,margin:'4px 0 7px'}}>
        <span style={{width:50,height:50,borderRadius:18,background:'linear-gradient(135deg,#20183F,#765AFF)',color:'#fff',display:'grid',placeItems:'center',boxShadow:'0 14px 35px rgba(84,61,205,.25)',flexShrink:0}}><RadarIcon size={24}/></span>
        <div style={{flex:1,minWidth:0}}><h2 className="d" style={{fontSize:38,margin:0}}>Ra<span className="it">dar</span></h2><div className="m">O mundo agora, sem misturar com o teu Feed.</div></div>
        <TopActions tab={tab} setTab={setTab} setThread={setThread} unreadCount={unreadCount}/>
      </div>

      <div style={{margin:'15px 0 13px',borderRadius:22,padding:15,background:'linear-gradient(135deg,#17122F,#29204E)',color:'#fff',boxShadow:'0 17px 42px rgba(26,18,61,.16)',display:'flex',gap:11,alignItems:'flex-start'}}>
        <ShieldCheck size={20} style={{marginTop:1,flexShrink:0}}/>
        <div style={{fontSize:12.5,lineHeight:1.5,opacity:.92}}><b>Fontes editoriais verificadas.</b> O Radar mostra manchetes e contexto e mantém o artigo original no respetivo órgão. Conteúdo comercial continua sempre identificado.</div>
      </div>

      {me?.is_staff&&<button type="button" className="p" onClick={()=>setScreen?.('radar-admin')} style={{width:'100%',justifyContent:'center',marginBottom:12}}><Settings2 size={15}/>Gerir Radar</button>}

      <div aria-label="Filtros do Radar" className="ns" style={{display:'flex',gap:8,overflowX:'auto',padding:'2px 1px 11px'}}>
        {FILTERS.map(([value,Icon,label])=>{const active=filter===value;return <button key={value||'all'} type="button" onClick={()=>setFilter(value)} aria-pressed={active} className="p" style={{flexShrink:0,padding:'9px 12px',borderRadius:999,background:active?'#17122F':'rgba(255,255,255,.8)',color:active?'#fff':'var(--ink)',borderColor:active?'#17122F':'rgba(73,57,137,.13)'}}><Icon size={14}/>{label}</button>})}
      </div>

      {filter==='news' && publishers.length>1 && <div style={{margin:'1px 0 14px'}}>
        <div style={{fontSize:11,fontWeight:850,letterSpacing:'.08em',textTransform:'uppercase',color:'#77708F',margin:'0 2px 8px'}}>Fontes</div>
        <div className="ns" style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:2}}>
          <button onClick={()=>setPublisher('')} className="p" style={{flexShrink:0,padding:'8px 10px',background:!publisher?'#DED7FF':'rgba(255,255,255,.8)'}}>Todas</button>
          {publishers.map(name=><button key={name} onClick={()=>setPublisher(name)} className="p" style={{flexShrink:0,padding:'7px 10px 7px 7px',background:publisher===name?'#DED7FF':'rgba(255,255,255,.8)',gap:7}}><PublisherMark name={name} size={27}/>{name}<ChevronRight size={12}/></button>)}
        </div>
      </div>}

      {loading ? <div className="m" style={{padding:38,textAlign:'center'}}>A sintonizar o Radar…</div> : !visible.length ? <Empty>Sem sinais nesta categoria.<br/>Quando houver algo relevante, aparece aqui.</Empty> : <>
        {hero&&<RadarCard item={hero} hero/>}
        {rest.length>0&&<div style={{display:'grid',gap:12,marginTop:12}}>{rest.map(item=><RadarCard key={item.id} item={item}/>)}</div>}
      </>}
    </div>
    <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} threads={threads}/>
    <Toast text={toast}/>
  </div>;
}
