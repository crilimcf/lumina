import React, { useEffect, useRef, useState } from 'react';
import { Check, Eye, Loader2, MoreHorizontal, Pencil, SmilePlus, Timer, Trash2, X } from 'lucide-react';
import { api } from '../../api.js';
import { PAL } from '../../ui.jsx';
import { locale, t } from '../../i18n.js';

const REACTION_CHOICES = ['👍','❤️','😂','😮','😢','🔥'];

function updateReactionCounts(current, previous, next) {
  const counts = new Map((Array.isArray(current) ? current : []).map(item => [item.emoji, Number(item.count || 0)]));
  if (previous) counts.set(previous, Math.max(0, (counts.get(previous) || 0) - 1));
  if (next) counts.set(next, (counts.get(next) || 0) + 1);
  return REACTION_CHOICES
    .map(emoji => ({ emoji, count:counts.get(emoji) || 0 }))
    .filter(item => item.count > 0);
}

export function Bubble({ msg, mine, onReveal, onEdit, onDelete }) {
  const [content, setContent] = useState(null);
  const [left, setLeft] = useState(null);
  const [dying, setDying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.body || '');
  const [mediaOpen, setMediaOpen] = useState(false);
  const [reactionOpen, setReactionOpen] = useState(false);
  const [reactionBusy, setReactionBusy] = useState(false);
  const [reactions, setReactions] = useState(Array.isArray(msg.reactions) ? msg.reactions : []);
  const [myReaction, setMyReaction] = useState(msg.my_reaction || null);
  const hold = useRef({ timer:0, x:0, y:0 });
  const rootRef = useRef(null);

  useEffect(() => { setDraft(msg.body || ''); }, [msg.body]);
  useEffect(() => { setReactions(Array.isArray(msg.reactions) ? msg.reactions : []); }, [msg.reactions]);
  useEffect(() => { setMyReaction(msg.my_reaction || null); }, [msg.my_reaction]);
  useEffect(() => () => window.clearTimeout(hold.current.timer), []);
  useEffect(() => {
    if (!reactionOpen && !menu) return undefined;
    const dismiss = event => {
      if (rootRef.current?.contains(event.target)) return;
      setReactionOpen(false);
      setMenu(false);
    };
    const dismissOnScroll = () => {
      setReactionOpen(false);
      setMenu(false);
    };
    const dismissOnKey = event => {
      if (event.key !== 'Escape') return;
      setReactionOpen(false);
      setMenu(false);
    };
    document.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('scroll', dismissOnScroll, true);
    document.addEventListener('keydown', dismissOnKey);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('scroll', dismissOnScroll, true);
      document.removeEventListener('keydown', dismissOnKey);
    };
  }, [reactionOpen, menu]);
  useEffect(() => {
    if (left === null || left > 0) {
      if (left > 0) {
        const timer = setTimeout(() => setLeft(left - 1), 1000);
        return () => clearTimeout(timer);
      }
      return;
    }
    setDying(true);
    const timer = setTimeout(() => setContent(null), 600);
    return () => clearTimeout(timer);
  }, [left]);

  const reveal = async () => {
    setBusy(true);
    try {
      const out = await onReveal(msg.id);
      setContent(out);
      setLeft(Math.max(1, Math.round((new Date(out.expiresAt) - Date.now()) / 1000)));
    } catch (error) { setContent({ error: error.message }); }
    finally { setBusy(false); }
  };

  const saveEdit = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    try { await onEdit?.(msg.id, body); setEditing(false); setMenu(false); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    setMenu(false);
    if (!window.confirm(t('Apagar esta mensagem para todos?'))) return;
    await onDelete?.(msg.id);
  };

  const reactable = msg.mode === 'normal' && !msg.deleted_at && !msg.purged_at && !dying;
  const chooseReaction = async emoji => {
    if (!reactable || reactionBusy) return;
    const previous = myReaction;
    const target = previous === emoji ? null : emoji;
    const previousCounts = reactions;
    setMyReaction(target);
    setReactions(updateReactionCounts(previousCounts, previous, target));
    setReactionOpen(false);
    setReactionBusy(true);
    try {
      if (target) await api.messages.react(msg.id, target);
      else await api.messages.unreact(msg.id);
    } catch {
      setMyReaction(previous);
      setReactions(previousCounts);
    } finally {
      setReactionBusy(false);
    }
  };

  const openReactions = () => {
    if (!reactable) return;
    setMenu(false);
    setReactionOpen(true);
    window.navigator?.vibrate?.(8);
  };
  const cancelHold = () => {
    window.clearTimeout(hold.current.timer);
    hold.current.timer = 0;
  };
  const startHold = event => {
    if (!reactable || (event.pointerType === 'mouse' && event.button !== 0)) return;
    cancelHold();
    hold.current.x = event.clientX;
    hold.current.y = event.clientY;
    hold.current.timer = window.setTimeout(openReactions, 430);
  };
  const moveHold = event => {
    if (!hold.current.timer) return;
    if (Math.abs(event.clientX - hold.current.x) > 12 || Math.abs(event.clientY - hold.current.y) > 12) cancelHold();
  };
  const contextReaction = event => {
    if (!reactable) return;
    event.preventDefault();
    openReactions();
  };

  const side = { alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', minWidth: 0 };
  const when = new Date(msg.created_at).toLocaleTimeString(locale, { hour:'2-digit', minute:'2-digit' });
  const receipt = msg.read_at ? t('Vista') : msg.delivered_at ? t('Entregue') : t('Enviada');
  const stamp = (extra) => <div className="m message-stamp" style={{ marginTop:5, textAlign:mine?'right':'left', display:'flex', justifyContent:mine?'flex-end':'flex-start', gap:5, alignItems:'center', flexWrap:'wrap' }}>
    <span>{when}</span>{msg.edited_at && !msg.deleted_at && <span>· {t('editada')}</span>}{mine && <span>· {receipt}</span>}{extra && <span>· {extra}</span>}
    {reactable && <button type="button" className={`message-reaction-trigger${reactionOpen?' is-active':''}`} onClick={()=>{setMenu(false);setReactionOpen(value=>!value)}} aria-label={t('Reagir à mensagem')}><SmilePlus size={14}/></button>}
    {mine && !msg.deleted_at && !dying && <span style={{ position:'relative' }}><button type="button" onClick={()=>{setReactionOpen(false);setMenu(value=>!value)}} aria-label={t('Opções da mensagem')} style={{ border:0,background:'transparent',padding:2,color:'inherit',opacity:.75 }}><MoreHorizontal size={15}/></button>{menu && <span className="message-menu" style={{ position:'absolute',right:0,bottom:22,zIndex:12,background:'var(--card)',border:'1px solid var(--edge)',borderRadius:13,padding:5,boxShadow:'0 10px 28px rgba(20,18,42,.16)',display:'grid',minWidth:125 }}>
      {msg.mode==='normal' && msg.kind==='text' && <button onClick={()=>{setEditing(true);setMenu(false)}} style={{border:0,background:'transparent',padding:'9px 10px',textAlign:'left',display:'flex',gap:7,alignItems:'center'}}><Pencil size={14}/>{t('Editar')}</button>}
      <button onClick={remove} style={{border:0,background:'transparent',padding:'9px 10px',textAlign:'left',display:'flex',gap:7,alignItems:'center',color:'#C43D4D'}}><Trash2 size={14}/>{t('Apagar')}</button>
    </span>}</span>}
  </div>;

  const reactionControls = reactable && <>
    {reactionOpen && <div className="message-reaction-tray" role="menu" aria-label={t('Reações à mensagem')}>
      {REACTION_CHOICES.map(emoji => <button
        type="button"
        role="menuitem"
        key={emoji}
        className={`message-reaction-choice${myReaction===emoji?' is-selected':''}`}
        aria-label={emoji}
        aria-pressed={myReaction===emoji}
        disabled={reactionBusy}
        onClick={()=>chooseReaction(emoji)}
      >{emoji}</button>)}
    </div>}
    {reactions.length > 0 && <div className="message-reaction-summary" aria-label={t('Reações')}>
      {reactions.map(item => <button
        type="button"
        key={item.emoji}
        className={`message-reaction-pill${myReaction===item.emoji?' is-mine':''}`}
        aria-label={`${item.emoji} ${item.count}`}
        disabled={reactionBusy}
        onClick={()=>chooseReaction(item.emoji)}
      ><span>{item.emoji}</span><span>{item.count}</span></button>)}
    </div>}
  </>;

  const wrapClass = `in message-wrap ${mine ? 'message-wrap-mine' : 'message-wrap-theirs'}`;
  const holdProps = reactable ? {
    onPointerDown:startHold,
    onPointerMove:moveHold,
    onPointerUp:cancelHold,
    onPointerCancel:cancelHold,
    onContextMenu:contextReaction,
  } : {};

  if (msg.deleted_at) return <div className={wrapClass} style={side}><div className="ghost message-ghost"><Trash2 size={14}/>{t('Mensagem apagada')}</div>{stamp()}</div>;
  if (msg.purged_at || content?.error || dying) return <div className={wrapClass} style={side}>
    <div className="ghost message-ghost">{msg.mode==='once'?<Eye size={14}/>:<Timer size={14}/>} {msg.mode==='once'?t('Conteúdo já visto'):t('Mensagem apagada')}</div>{stamp()}
  </div>;

  if (msg.mode !== 'normal' && !content) {
    if (mine) return <div className={wrapClass} style={side}>
      <div className="ghost message-ghost" style={{ borderStyle:'solid',borderColor:'rgba(43,43,247,.28)',color:'var(--cobalt)' }}>
        {msg.mode==='once'?<Eye size={14}/>:<Timer size={14}/>} {msg.mode==='once' ? `${t(msg.media_type==='video'?'Vídeo':'Foto')} · ${t('uma vez')}` : `${t('Efémera')} · ${t('à espera')}`}
      </div>{stamp()}
    </div>;
    return <div className={wrapClass} style={side}>
      <button className="veil message-veil" onClick={busy?undefined:reveal} style={{ border:0,width:msg.mode==='once'?200:'auto',height:msg.mode==='once'?250:'auto',cursor:'pointer' }}>
        {msg.mode==='once' && <span style={{position:'absolute',inset:0,background:PAL[msg.palette||1].bg}}/>}
        <span className="veil-in" style={{position:msg.mode==='once'?'absolute':'static',inset:0,padding:msg.mode==='once'?0:'14px 18px'}}>
          {busy?<Loader2 size={20}/>:msg.mode==='once'?<Eye size={22}/>:<Timer size={20}/>}<span style={{fontSize:13,fontWeight:600}}>{msg.mode==='once'?t('Ver {media} uma vez', { media:t(msg.media_type==='video'?'vídeo':'foto') }):t('Toca para ler')}</span><span className="m" style={{color:'rgba(20,18,42,.6)'}}>{msg.mode==='once'?t('não volta'):t('apaga-se depois')}</span>
        </span>
      </button>{stamp()}
    </div>;
  }

  const body = content?.body ?? msg.body;
  const media = content?.mediaUrl ?? msg.media_url;
  const mediaType = content?.mediaType ?? msg.media_type;

  return <div ref={rootRef} className={wrapClass} style={side} {...holdProps}>
    {editing ? <div style={{display:'grid',gap:7,minWidth:230}}><textarea value={draft} autoFocus onChange={event=>setDraft(event.target.value)} maxLength={4000} style={{minHeight:76,resize:'vertical'}}/><div style={{display:'flex',justifyContent:'flex-end',gap:7}}><button className="p p-sm" onClick={()=>{setEditing(false);setDraft(msg.body||'')}}><X size={14}/> {t('Cancelar')}</button><button className="p p-sm p-brand" disabled={busy||!draft.trim()} onClick={saveEdit}><Check size={14}/> {t('Guardar')}</button></div></div>
      : media ? (mediaType==='video' ? <video className="message-media" src={media} controls playsInline preload="metadata" style={{width:'min(280px,72vw)',maxHeight:360,borderRadius:20,display:'block',background:'#080711'}}/> : <button onClick={()=>setMediaOpen(true)} aria-label={t('Abrir fotografia')} style={{padding:0,border:0,background:'transparent',display:'block'}}><img className="message-media" src={media} alt={t('Fotografia enviada')} style={{width:'min(280px,72vw)',maxHeight:360,objectFit:'cover',borderRadius:20,display:'block'}}/></button>)
      : <div data-i18n-ignore="true" className={`message-bubble ${mine ? 'message-bubble-mine' : 'message-bubble-theirs'}`} style={{padding:'12px 16px',fontSize:15,lineHeight:1.4,borderRadius:mine?'20px 20px 6px 20px':'20px 20px 20px 6px',background:mine?'var(--cobalt)':'var(--card)',color:mine?'#fff':'var(--ink)',boxShadow:mine?'0 5px 16px rgba(43,43,247,.32)':'0 3px 12px rgba(30,16,90,.12)'}}>{body}</div>}
    {reactionControls}
    {stamp(left>0?t('apaga em {seconds} s', { seconds:left }):undefined)}
    {mediaOpen && mediaType!=='video' && <div onClick={()=>setMediaOpen(false)} style={{position:'fixed',inset:0,zIndex:220,background:'rgba(5,4,12,.95)',display:'grid',placeItems:'center',padding:16}}><img src={media} alt={t('Fotografia em tamanho grande')} style={{maxWidth:'100%',maxHeight:'90dvh',objectFit:'contain'}}/><button onClick={()=>setMediaOpen(false)} aria-label={t('Fechar')} style={{position:'absolute',top:'calc(12px + env(safe-area-inset-top))',right:14,width:42,height:42,borderRadius:99,border:0,background:'rgba(255,255,255,.14)',color:'#fff',display:'grid',placeItems:'center'}}><X size={20}/></button></div>}
  </div>;
}