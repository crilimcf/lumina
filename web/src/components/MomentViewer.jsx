import React, { useEffect, useRef, useState } from 'react';
import { Pencil, RefreshCw, Send, Trash2, Users, X } from 'lucide-react';
import { Orb } from '../ui.jsx';
import { api } from '../api.js';

function momentIsVideo(item) {
  return !!item && (item.media_mime?.startsWith('video/') || /\.(mp4|mov|webm)(?:$|\?)/i.test(item.media_url || ''));
}

function SideMomentCard({ group, side }) {
  if (!group?.items?.length) return null;
  const item = side < 0 ? group.items.at(-1) : group.items[0];
  const isVideo = momentIsVideo(item);
  return <div aria-hidden="true" style={{
    position:'absolute', top:'9%', bottom:'9%', width:'68%',
    left:side < 0 ? '-50%' : '82%', borderRadius:28, overflow:'hidden',
    transform:`rotateY(${side < 0 ? 48 : -48}deg) scale(.9)`,
    transformOrigin:side < 0 ? 'right center' : 'left center',
    background:'#171329', boxShadow:'0 24px 70px rgba(0,0,0,.38)', opacity:.72,
    border:'1px solid rgba(255,255,255,.16)', pointerEvents:'none',
  }}>
    {item?.media_url && !isVideo
      ? <img src={item.media_url} alt="" loading="eager" decoding="async" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
      : <div style={{width:'100%',height:'100%',display:'grid',placeItems:'center',background:'linear-gradient(145deg,#30255D,#0B0914)'}}><Orb p={group.author.palette} avatarUrl={group.author.avatarUrl} s={72}/></div>}
    <div style={{position:'absolute',inset:'auto 0 0',padding:'34px 18px 18px',background:'linear-gradient(transparent,rgba(0,0,0,.72))',color:'#fff',fontWeight:750,fontSize:13}}>{group.author.name}</div>
  </div>;
}

export function MomentViewer({ group, prevGroup, nextGroup, onClose, onNext, onPrev, onView, onEdit = group.onEdit, onDelete, onReply, onReact, meId }) {
  const [i, setI] = useState(0);
  const [reply, setReply] = useState('');
  const [sent, setSent] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [replacing, setReplacing] = useState(false);
  const [replyFocused, setReplyFocused] = useState(false);
  const [burst, setBurst] = useState(null);
  const [interactions, setInteractions] = useState(null);
  const [interactionsBusy, setInteractionsBusy] = useState(false);
  const [dragX, setDragX] = useState(0);
  const replacementInput = useRef(null);
  const videoRef = useRef(null);
  const touchStart = useRef(null);
  const dragged = useRef(false);
  const safeI = Math.min(i, group.items.length - 1);
  const item = group.items[safeI];
  const leftGroup = prevGroup || group.prevGroup || null;
  const rightGroup = nextGroup || group.nextGroup || null;
  const isMine = group.author.id === meId;
  const isVideo = momentIsVideo(item);
  const paused = replyFocused || !!reply.trim() || replacing || !!interactions || Math.abs(dragX) > 4;

  useEffect(() => { setI(0); setReply(''); setSent(false); setReplyFocused(false); setInteractions(null); setDragX(0); }, [group.author.id]);
  useEffect(() => { setVideoProgress(0); setReplyFocused(false); setInteractions(null); }, [item?.id]);
  useEffect(() => { if (item && !isMine) onView(item.id); }, [item?.id]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (paused) video.pause();
    else video.play().catch(() => {});
  }, [paused, item?.id]);

  useEffect(() => {
    if (!item || paused || isVideo) return;
    const t = setTimeout(() => {
      if (safeI < group.items.length - 1) setI(safeI + 1);
      else onNext();
    }, 5000);
    return () => clearTimeout(t);
  }, [safeI, group.author.id, group.items.length, paused, isVideo, item?.id, onNext]);

  if (!item) return null;

  const advance = (dir) => {
    if (paused && Math.abs(dragX) < 4) return;
    if (dir > 0 && safeI < group.items.length - 1) return setI(safeI + 1);
    if (dir < 0 && safeI > 0) return setI(safeI - 1);
    if (dir > 0) return onNext();
    onPrev();
  };

  const startSwipe = (event) => {
    const touch = event.touches?.[0];
    if (!touch || replyFocused || interactions || replacing) return;
    touchStart.current = touch.clientX;
    dragged.current = false;
  };
  const moveSwipe = (event) => {
    if (touchStart.current === null) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    const delta = Math.max(-110, Math.min(110, touch.clientX - touchStart.current));
    if (Math.abs(delta) > 8) dragged.current = true;
    setDragX(delta);
  };
  const endSwipe = () => {
    const delta = dragX;
    touchStart.current = null;
    setDragX(0);
    if (delta < -58) onNext();
    else if (delta > 58) onPrev();
    setTimeout(() => { dragged.current = false; }, 80);
  };

  const submitReply = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    await onReply(group.author.id, reply.trim());
    setReply(''); setSent(true);
    setTimeout(() => setSent(false), 2200);
  };

  const replaceMedia = async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file || !onEdit) return;
    setReplacing(true);
    try { await onEdit(item.id, file); } finally { setReplacing(false); }
  };

  const reactWithEffect = async (kind, emoji) => {
    setBurst({ emoji, n: Date.now() });
    try { navigator.vibrate?.(24); } catch {}
    setTimeout(() => setBurst(null), 650);
    await onReact?.(item.id, kind);
  };

  const openInteractions = async () => {
    if (!isMine || interactionsBusy) return;
    setInteractionsBusy(true);
    try { setInteractions(await api.moments.interactions(item.id)); }
    catch { setInteractions([]); }
    finally { setInteractionsBusy(false); }
  };

  const mine = item.my_reactions || [];
  const reactionButton = (kind, emoji, count) => (
    <button type="button" onClick={() => reactWithEffect(kind, emoji)} aria-label={kind === 'like' ? 'Gostar deste Momento' : 'Reagir com fogo a este Momento'}
      style={{ border:'1px solid rgba(255,255,255,.28)', background:mine.includes(kind)?'rgba(255,255,255,.28)':'rgba(10,8,25,.45)', color:'#fff', borderRadius:999, minWidth:52, height:44, padding:'0 11px', display:'flex', alignItems:'center', justifyContent:'center', gap:5, fontSize:20, backdropFilter:'blur(10px)', transform:burst?.emoji===emoji?'scale(1.12)':'scale(1)', transition:'transform .18s ease' }}>
      <span>{emoji}</span>{count > 0 && <span style={{ fontSize:11, fontWeight:800 }}>{count}</span>}
    </button>
  );

  const interactionCount = (item.likes || 0) + (item.fires || 0);
  const cardRotate = dragX / -22;
  const cardScale = 1 - Math.min(.035, Math.abs(dragX) / 3200);

  return <div className="reveal" style={{ position:'fixed', inset:0, zIndex:80, background:'radial-gradient(circle at 50% 25%,#24203E,#07060D 72%)', overflow:'hidden' }}>
    <div style={{ display:'flex', gap:4, padding:'12px 12px 0', position:'relative', zIndex:14 }}>
      {group.items.map((it, idx) => <div key={it.id} style={{ flex:1, height:3, borderRadius:9, background:'rgba(255,255,255,.28)', overflow:'hidden' }}>
        <div style={{ height:'100%', background:'#fff', width:idx<safeI?'100%':idx>safeI?'0%':(idx===safeI&&isVideo)?`${videoProgress}%`:'100%', transition:idx===safeI&&!isVideo&&!paused?'width 5s linear':'none' }} />
      </div>)}
    </div>
    <div style={{ position:'relative', zIndex:14, display:'flex', alignItems:'center', gap:6, padding:'12px 16px' }}>
      <Orb p={group.author.palette} avatarUrl={group.author.avatarUrl} s={30}/>
      <span style={{ color:'#fff', fontWeight:600, fontSize:14 }}>{isMine?'Tu':group.author.name}</span>
      <span style={{ color:'rgba(255,255,255,.6)', fontSize:11 }}>{new Date(item.created_at).toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'})}</span>
      {isMine && <input ref={replacementInput} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" hidden onChange={replaceMedia}/>} 
      {isMine && <button onClick={()=>replacementInput.current?.click()} disabled={replacing} aria-label="Editar momento" style={{ marginLeft:'auto', background:'none', border:0, color:'rgba(255,255,255,.8)', padding:8 }}>{replacing?<RefreshCw size={17}/>:<Pencil size={17}/>}</button>}
      {isMine && <button onClick={()=>onDelete(item.id)} aria-label="Apagar momento" style={{ background:'none', border:0, color:'rgba(255,255,255,.8)', padding:8 }}><Trash2 size={17}/></button>}
      <button onClick={onClose} aria-label="Fechar" style={{ marginLeft:isMine?0:'auto', background:'none', border:0, color:'#fff', padding:8 }}><X size={20}/></button>
    </div>

    <div onTouchStart={startSwipe} onTouchMove={moveSwipe} onTouchEnd={endSwipe} onTouchCancel={endSwipe}
      style={{ position:'absolute', inset:'64px 0 82px', perspective:'820px', transformStyle:'preserve-3d', touchAction:'pan-y', zIndex:1 }}>
      <SideMomentCard group={leftGroup} side={-1}/>
      <SideMomentCard group={rightGroup} side={1}/>
      <div style={{
        position:'absolute', inset:'2% 6%', borderRadius:30, overflow:'hidden', background:'#05040A',
        transform:`translate3d(${dragX}px,0,60px) rotateY(${cardRotate}deg) scale(${cardScale})`,
        transition:touchStart.current === null ? 'transform .28s cubic-bezier(.2,.8,.2,1)' : 'none',
        boxShadow:'0 26px 90px rgba(0,0,0,.52)', border:'1px solid rgba(255,255,255,.14)',
        willChange:'transform',
      }}>
        {item.media_url ? (isVideo
          ? <video ref={videoRef} src={item.media_url} autoPlay controls playsInline preload="metadata" aria-label={`Vídeo do momento de ${group.author.name}`} onTimeUpdate={e=>{const m=e.currentTarget;if(Number.isFinite(m.duration)&&m.duration>0)setVideoProgress(Math.min(100,(m.currentTime/m.duration)*100));}} onEnded={()=>advance(1)} style={{width:'100%',height:'100%',objectFit:'cover',background:'#05040A'}}/>
          : <img src={item.media_url} alt="" decoding="async" style={{width:'100%',height:'100%',objectFit:'cover'}}/>)
          : <div style={{width:'100%',height:'100%',background:'linear-gradient(160deg,#171329,#090811)'}}/>}
      </div>
    </div>

    {!isVideo ? <div style={{position:'absolute',inset:'82px 0 94px',display:'flex',zIndex:5}}><div style={{flex:1,cursor:'pointer'}} onClick={()=>{if(!dragged.current)advance(-1)}}/><div style={{flex:1,cursor:'pointer'}} onClick={()=>{if(!dragged.current)advance(1)}}/></div> : <><button onClick={()=>advance(-1)} aria-label="Momento anterior" style={{position:'absolute',zIndex:6,left:0,top:86,bottom:94,width:'12%',border:0,background:'transparent'}}/><button onClick={()=>advance(1)} aria-label="Momento seguinte" style={{position:'absolute',zIndex:6,right:0,top:86,bottom:94,width:'12%',border:0,background:'transparent'}}/></>}

    {burst && <div key={burst.n} style={{ position:'absolute', zIndex:18, left:'50%', top:'50%', transform:'translate(-50%,-50%)', fontSize:76, animation:'pop .65s ease forwards', pointerEvents:'none', filter:'drop-shadow(0 12px 20px rgba(0,0,0,.28))' }}>{burst.emoji}</div>}

    {!isMine && <form onSubmit={submitReply} style={{ position:'absolute', zIndex:16, left:0, right:0, bottom:0, padding:'14px 14px calc(14px + env(safe-area-inset-bottom))', display:'flex', gap:8, alignItems:'center', background:'linear-gradient(0deg,rgba(0,0,0,.82),transparent)' }}>
      {reactionButton('like','👍',item.likes||0)}
      {reactionButton('fire','🔥',item.fires||0)}
      <input value={reply} onChange={e=>setReply(e.target.value)} onFocus={()=>setReplyFocused(true)} onBlur={()=>setReplyFocused(false)} placeholder={sent?'Enviado ✓':`Responder a ${group.author.name.split(' ')[0]}…`} style={{minWidth:0,background:'rgba(255,255,255,.14)',border:'1.5px solid rgba(255,255,255,.3)',color:'#fff'}}/>
      <button type="submit" aria-label="Enviar resposta" disabled={!reply.trim()} className="p p-brand" style={{padding:'12px 14px',flexShrink:0}}><Send size={16}/></button>
    </form>}

    {isMine && <div style={{ position:'absolute', zIndex:16, left:0, right:0, bottom:0, padding:'12px 14px calc(14px + env(safe-area-inset-bottom))', display:'flex', justifyContent:'center', background:'linear-gradient(0deg,rgba(0,0,0,.82),transparent)' }}>
      <button onClick={openInteractions} className="p" style={{ background:'rgba(12,10,29,.72)', border:'1px solid rgba(255,255,255,.24)', color:'#fff', display:'flex', alignItems:'center', gap:8, padding:'10px 14px' }}><Users size={16}/>{interactionsBusy?'A carregar…':`Interações ${interactionCount}`}</button>
    </div>}

    {interactions && <div onClick={()=>setInteractions(null)} style={{ position:'fixed', inset:0, zIndex:230, background:'rgba(6,5,14,.72)', display:'flex', alignItems:'flex-end' }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:520, margin:'0 auto', maxHeight:'65dvh', overflowY:'auto', background:'#F5F3FF', color:'#14122A', borderRadius:'26px 26px 0 0', padding:'18px 16px calc(18px + env(safe-area-inset-bottom))' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}><div className="d" style={{fontSize:26,flex:1}}>Interações</div><button className="p" onClick={()=>setInteractions(null)}><X size={16}/></button></div>
        {interactions.length===0 ? <div className="m" style={{padding:'24px 4px'}}>Ainda ninguém reagiu a este Momento.</div> : <div style={{display:'grid',gap:9}}>{interactions.map(person=><div key={person.id} className="card" style={{padding:11,display:'flex',alignItems:'center',gap:10}}><Orb p={person.palette} avatarUrl={person.avatar_url} s={38}/><div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:14}}>{person.name}</div><div className="m">@{person.handle}</div></div><div style={{fontSize:22,letterSpacing:3}}>{(person.reactions||[]).map(kind=>kind==='like'?'👍':'🔥').join('')}</div></div>)}</div>}
      </div>
    </div>}
  </div>;
}
