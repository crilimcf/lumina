import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, BellRing, Camera, CheckCircle2, Eye, MessageSquare, Phone, Send, Timer, Video, X } from 'lucide-react';
import { api } from '../api.js';
import { Orb, Empty } from '../ui.jsx';
import { Bubble } from '../components/messages/Bubble.jsx';
import { MediaEditor } from '../components/messages/MediaEditor.jsx';
import { Nav, TopActions } from '../components/AppChrome.jsx';

export function Conversas({
  me, tab, setTab, setComp, unreadCount, threads, contacts = [], openContact,
  thread, setThread, msgs, text, setText, mode, setMode,
  mediaDraft, mediaReady, chooseMedia, acceptMedia, clearMedia,
  sending, send, editMessage, removeMessage, end,
  startCall, callBusy,
}) {
  const availableContacts = useMemo(() => {
    const inThreads = new Set(threads.map(t => t.other_id));
    return contacts.filter(person => !inThreads.has(person.id));
  }, [contacts, threads]);

  const [callPush, setCallPush] = useState({ checking:true, supported:true, standalone:true, permission:'default', subscribed:false });
  const [callPushBusy, setCallPushBusy] = useState(false);

  const refreshCallPush = useCallback(async () => {
    try {
      const snapshot = await window.__luminaPushSnapshot?.();
      if (snapshot) setCallPush({ checking:false, ...snapshot });
      else setCallPush(current => ({ ...current, checking:false }));
    } catch {
      setCallPush(current => ({ ...current, checking:false }));
    }
  }, []);

  useEffect(() => {
    refreshCallPush();
    window.addEventListener('lumina:push-state', refreshCallPush);
    window.addEventListener('focus', refreshCallPush);
    return () => {
      window.removeEventListener('lumina:push-state', refreshCallPush);
      window.removeEventListener('focus', refreshCallPush);
    };
  }, [refreshCallPush]);

  const enableCallsHere = useCallback(async () => {
    if (callPushBusy) return;
    setCallPushBusy(true);
    try { await window.__luminaEnablePush?.(); }
    finally { setCallPushBusy(false); await refreshCallPush(); }
  }, [callPushBusy, refreshCallPush]);

  const callPushReady = callPush.permission === 'granted' && callPush.subscribed;
  const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const callReadiness = (compact = false) => {
    if (callPush.checking) return null;
    if (callPushReady) return compact ? null : <div style={{display:'flex',alignItems:'center',gap:9,padding:'10px 12px',borderRadius:16,background:'rgba(41,176,119,.09)',border:'1px solid rgba(41,176,119,.18)',marginBottom:14}}>
      <CheckCircle2 size={17} style={{color:'#19875A',flexShrink:0}}/><div style={{fontSize:12.5,fontWeight:750,color:'#225D47'}}>Chamadas neste iPhone ativas</div>
    </div>;

    const notStandalone = isIos && !callPush.standalone;
    const denied = callPush.permission === 'denied';
    const unsupported = callPush.supported === false;
    const title = unsupported
      ? 'Este browser não permite chamadas em segundo plano'
      : notStandalone
        ? 'Instala a Lumina no ecrã principal para receber chamadas'
        : denied
          ? 'As notificações da Lumina estão bloqueadas neste iPhone'
          : 'Ativa as chamadas neste iPhone';
    const detail = unsupported
      ? 'Com a app aberta, as chamadas continuam disponíveis.'
      : notStandalone
        ? 'No iPhone, o aviso de chamada com a Lumina fechada precisa da web app no ecrã principal.'
        : denied
          ? 'Reativa as notificações da Lumina nas Definições do iPhone para receber chamadas quando a app não está aberta.'
          : 'Isto permite que uma chamada toque mesmo quando a Lumina está em segundo plano.';
    const canEnable = !unsupported && !notStandalone && !denied;

    return <div style={{display:'flex',alignItems:'center',gap:10,padding:compact?'9px 12px':'12px 13px',borderRadius:compact?0:18,background:'#FFF7E9',border:compact?'0 solid transparent':'1px solid #F1D6A6',borderBottom:compact?'1px solid #E8DCC8':undefined,marginBottom:compact?0:16}}>
      {denied||unsupported?<AlertTriangle size={17} style={{color:'#A76100',flexShrink:0}}/>:<BellRing size={17} style={{color:'#8051D6',flexShrink:0}}/>}
      <div style={{flex:1,minWidth:0}}><div style={{fontSize:compact?11.5:12.5,fontWeight:800,lineHeight:1.25}}>{title}</div>{!compact&&<div style={{fontSize:10.5,color:'var(--grey)',lineHeight:1.35,marginTop:3}}>{detail}</div>}</div>
      {canEnable&&<button type="button" className="p p-sm p-brand" onClick={enableCallsHere} disabled={callPushBusy} style={{flexShrink:0}}>{callPushBusy?'A ativar…':'Ativar'}</button>}
    </div>;
  };

  const mediaPicker = (label) => <label className="p" style={{cursor:'pointer',padding:12,display:'flex',alignItems:'center',gap:9,justifyContent:'center'}}>
    <Camera size={16}/>{label && <span>{label}</span>}
    <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" hidden onChange={e=>{const file=e.target.files?.[0]||null;if(file)chooseMedia(file);e.target.value='';}}/>
  </label>;

  if (thread) {
    const modes = [['normal',MessageSquare,'Normal'],['timer',Timer,'Efémera'],['once',Eye,'Uma vez']];
    return <div style={{height:'100dvh',display:'flex',flexDirection:'column',background:'var(--paper)'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,padding:14,borderBottom:'1px solid #E5E0F2'}}>
        <button className="p" onClick={()=>setThread(null)} aria-label="Voltar às conversas" style={{padding:10}}><ArrowLeft size={16}/></button>
        <Orb p={thread.palette} avatarUrl={thread.avatar_url} s={36}/>
        <div style={{flex:1,minWidth:0}}><div style={{fontSize:15,fontWeight:600}}>{thread.name}</div><div className="m">@{thread.handle}</div></div>
        <button className="p" onClick={()=>startCall?.(thread,'audio')} disabled={callBusy} aria-label={`Ligar por áudio a ${thread.name}`} style={{padding:10}}><Phone size={17}/></button>
        <button className="p" onClick={()=>startCall?.(thread,'video')} disabled={callBusy} aria-label={`Fazer videochamada com ${thread.name}`} style={{padding:10}}><Video size={18}/></button>
      </div>
      {callReadiness(true)}
      <div className="ns" style={{flex:1,overflowY:'auto',padding:'4px 16px 16px',display:'flex',flexDirection:'column',gap:12}}>
        {msgs.length===0&&<Empty>Diz olá.</Empty>}
        {msgs.map(m=><Bubble key={m.id} msg={m} mine={m.sender_id===me.id} onReveal={api.messages.reveal} onEdit={editMessage} onDelete={removeMessage}/>)}
        <div ref={end}/>
      </div>
      <div style={{padding:'0 14px calc(16px + env(safe-area-inset-bottom))'}}>
        <div className="ns" style={{display:'flex',gap:7,overflowX:'auto',paddingBottom:9}}>{modes.map(([key,Icon,label])=><button key={key} onClick={()=>setMode(key)} className={`p p-sm${mode===key?(key==='normal'?' p-ink':' p-brand'):''}`} style={{flexShrink:0,display:'flex',alignItems:'center',gap:6}}><Icon size={13}/>{label}</button>)}</div>
        {mode!=='normal'&&<p style={{fontSize:11.5,lineHeight:1.4,color:'var(--grey)',marginBottom:9}}>{mode==='timer'?'Apaga-se pouco depois de ser aberta. Não impedimos capturas de ecrã.':'Foto ou vídeo abre uma vez e não volta. Não impedimos capturas de ecrã.'}</p>}
        {mediaReady && mode!=='timer' && <div style={{display:'flex',alignItems:'center',gap:9,padding:'9px 11px',marginBottom:9,border:'1px solid var(--edge)',borderRadius:14,background:'var(--card)'}}>
          <span style={{fontSize:18}}>{mediaReady.type==='video'?'🎥':'📷'}</span><span style={{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:13}}>{mediaReady.file.name}</span><button onClick={clearMedia} aria-label="Remover ficheiro" style={{border:0,background:'transparent',display:'grid',placeItems:'center'}}><X size={16}/></button>
        </div>}
        {mode==='once' ? <div style={{display:'grid',gap:9}}>
          {!mediaReady&&mediaPicker('Escolher foto ou vídeo')}
          <button className="p p-brand" onClick={send} disabled={!mediaReady||sending} aria-label="Enviar uma vez" style={{padding:'12px 15px'}}>{sending?'A enviar…':`Enviar ${mediaReady?.type==='video'?'vídeo':'foto'} · uma vez`}</button>
        </div> : mode==='timer' ? <div style={{display:'flex',gap:9}}>
          <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Mensagem efémera…"/>
          <button className="p p-brand" onClick={send} disabled={sending||!text.trim()} aria-label="Enviar mensagem" style={{padding:'12px 15px'}}><Send size={16}/></button>
        </div> : <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {!mediaReady&&mediaPicker('')}
          <input value={text} disabled={!!mediaReady} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder={mediaReady?'Media pronta para enviar':'Escrever…'} style={{minWidth:0}}/>
          <button className="p p-ink" onClick={send} disabled={sending||(!text.trim()&&!mediaReady)} aria-label="Enviar" style={{padding:'12px 15px'}}><Send size={16}/></button>
        </div>}
      </div>
      {mediaDraft&&<MediaEditor file={mediaDraft} onCancel={clearMedia} onReady={acceptMedia}/>} 
    </div>;
  }

  return <div style={{minHeight:'100dvh',paddingBottom:100,background:'linear-gradient(180deg,#EFEDFB,#DFDCF2)'}}><div style={{maxWidth:460,margin:'0 auto',padding:20}}>
    <div style={{display:'flex',alignItems:'center',gap:10,margin:'10px 0 18px'}}><h2 className="d" style={{fontSize:42,flex:1}}>Conver<span className="it">sas</span></h2><TopActions tab={tab} setTab={setTab} setThread={setThread} unreadCount={unreadCount}/></div>
    {callReadiness(false)}
    {threads.length===0&&availableContacts.length===0&&<Empty>Ainda sem contactos para conversar.<br/>Segue alguém ou aceita um seguidor.</Empty>}
    {threads.length>0&&<><div className="m" style={{margin:'0 3px 10px'}}>Conversas</div><div style={{display:'grid',gap:11}}>{threads.map((t,i)=><button key={t.id} onClick={()=>setThread({id:t.id,name:t.name,handle:t.handle,palette:t.palette,avatar_url:t.avatar_url,other_id:t.other_id})} className="card in" style={{border:0,cursor:'pointer',padding:15,display:'flex',gap:13,alignItems:'center',textAlign:'left',animationDelay:`${i*60}ms`}}><Orb p={t.palette} avatarUrl={t.avatar_url} s={44}/><span style={{flex:1,minWidth:0}}><span style={{display:'block',fontSize:15,fontWeight:600}}>{t.name}</span><span style={{display:'block',fontSize:14,color:'var(--grey)',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.body||'Toca para conversar'}</span></span>{t.unread>0&&<span style={{width:9,height:9,borderRadius:9,background:'var(--cobalt)',boxShadow:'0 0 0 4px rgba(91,61,245,.16)'}}/>}</button>)}</div></>}
    {availableContacts.length>0&&<><div className="m" style={{margin:threads.length?'24px 3px 10px':'0 3px 10px'}}>Pessoas</div><div style={{display:'grid',gap:9}}>{availableContacts.map((person,i)=><button key={person.id} onClick={()=>openContact?.(person)} className="card in" style={{border:0,cursor:'pointer',padding:13,display:'flex',gap:12,alignItems:'center',textAlign:'left',animationDelay:`${Math.min(i,8)*45}ms`}}><Orb p={person.palette} avatarUrl={person.avatar_url} s={42}/><span style={{flex:1,minWidth:0}}><span style={{display:'block',fontSize:15,fontWeight:700}}>{person.name}</span><span style={{display:'block',fontSize:12,color:'var(--grey)',marginTop:2}}>@{person.handle}{person.following&&person.follows_me?' · seguem-se':person.follows_me?' · segue-te':' · a seguir'}</span></span><span style={{width:36,height:36,borderRadius:99,display:'grid',placeItems:'center',background:'#ECE9FF',color:'var(--cobalt)'}}><MessageSquare size={17}/></span></button>)}</div></>}
  </div><Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} threads={threads}/></div>;
}
