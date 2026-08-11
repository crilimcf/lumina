import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, DoorOpen, Home, Image, Pencil, Plus, Radar as RadarIcon, RefreshCw, Send, Trash2, User, Video, X } from 'lucide-react';
import { api } from '../api.js';
import { PostImageEditor } from './posts/PostImageEditor.jsx';
import '../global-polish.css';

export function Toast({ text }) {
  return text ? <div className="in" style={{position:'fixed',bottom:92,left:'50%',transform:'translateX(-50%)',zIndex:70,background:'var(--ink)',color:'#fff',padding:'13px 22px',borderRadius:999,fontSize:14,fontWeight:600,maxWidth:'86%',textAlign:'center',boxShadow:'0 12px 30px rgba(20,18,42,.36)'}}>{text}</div> : null;
}

function useUnreadCount(unreadCount) {
  const [localUnread,setLocalUnread]=useState(typeof unreadCount==='number'?unreadCount:0);
  useEffect(()=>{
    if(typeof unreadCount==='number') { setLocalUnread(unreadCount); return; }
    let active=true;
    const refresh=()=>api.notifications.unread().then(r=>{if(active)setLocalUnread(r.count||0)}).catch(()=>{});
    refresh();
    const id=setInterval(refresh,15000);
    const onVisible=()=>{if(document.visibilityState==='visible')refresh()};
    document.addEventListener('visibilitychange',onVisible);
    return()=>{active=false;clearInterval(id);document.removeEventListener('visibilitychange',onVisible)};
  },[unreadCount]);
  return typeof unreadCount==='number'?unreadCount:localUnread;
}

export function TopActions({ tab,setTab,setThread,unreadCount }) {
  const shownUnread=useUnreadCount(unreadCount);
  const go=(next)=>{setThread?.(null);setTab(next)};
  return <div className="top-actions" aria-label="Atalhos pessoais">
    <button className={`top-action${tab==='alerts'?' top-action-on':''}`} onClick={()=>go('alerts')} aria-label={shownUnread?`Alertas, ${shownUnread} por ler`:'Alertas'}>
      <Bell size={18} strokeWidth={tab==='alerts'?2.5:2}/>
      {shownUnread>0&&<span className="top-action-badge">{shownUnread>99?'99+':shownUnread}</span>}
    </button>
    <button className={`top-action${tab==='me'?' top-action-on':''}`} onClick={()=>go('me')} aria-label="Perfil">
      <User size={18} strokeWidth={tab==='me'?2.5:2}/>
    </button>
  </div>;
}

export function Nav({ tab,setTab,setThread,setComp,threads=[] }) {
  const items=[['feed',Home,'Feed','Feed'],['rooms',DoorOpen,'Salas','Salas'],['new',Plus,'Novo','Novo'],['promos',RadarIcon,'Radar','Radar'],['dms',Send,'Chat','Conversas']];
  return <div className="nav" style={{display:'grid',gridTemplateColumns:'repeat(5,minmax(0,1fr))',gap:0}}>{items.map(([k,I,label,aria])=><button key={k} aria-label={aria} className={`nb${tab===k?' nb-on':''}`} style={{padding:'5px 2px',minWidth:0,position:'relative'}} onClick={()=>{
    if(k==='new') { setThread(null);setTab('feed');setComp({title:'Publicar'});return; }
    setTab(k);setThread(null);
  }}><I size={20} strokeWidth={tab===k?2.5:1.9}/><span style={{fontSize:9,letterSpacing:'.015em'}}>{label}</span>{k==='dms'&&threads.some(t=>t.unread>0)&&<span className="dot-badge"/>}</button>)}</div>;
}

export function Composer({ comp,setComp,file,setFile,body,setBody,busy,publish }) {
  const imageInput=useRef(null), videoInput=useRef(null);
  const [editingPhoto,setEditingPhoto]=useState(false);
  const previewUrl=useMemo(()=>file?URL.createObjectURL(file):null,[file]);
  const isVideo=!!file?.type?.startsWith('video/');
  useEffect(()=>()=>{if(previewUrl)URL.revokeObjectURL(previewUrl)},[previewUrl]);
  useEffect(()=>{if(!comp||!file||isVideo)setEditingPhoto(false)},[comp,file,isVideo]);
  const choosePhoto=()=>imageInput.current?.click(), chooseVideo=()=>videoInput.current?.click();
  const pickMedia=picked=>{if(!picked)return;setFile(picked);setEditingPhoto(picked.type.startsWith('image/'))};
  const removeMedia=()=>{setEditingPhoto(false);setFile(null);if(imageInput.current)imageInput.current.value='';if(videoInput.current)videoInput.current.value=''};
  if(!comp)return null;
  return <>
    <div className="composer-backdrop" onClick={()=>!busy&&setComp(null)} style={{position:'fixed',inset:0,background:'rgba(24,18,60,.38)',backdropFilter:'blur(5px)',display:'flex',alignItems:'flex-end',zIndex:60}}><div onClick={e=>e.stopPropagation()} className="in composer-sheet" style={{background:'linear-gradient(180deg,#F7F5FF,#E9E7F8)',borderRadius:'30px 30px 0 0',width:'100%',maxWidth:560,maxHeight:'94dvh',overflowY:'auto',margin:'0 auto',padding:'22px 20px calc(26px + env(safe-area-inset-bottom))',boxShadow:'0 -18px 60px rgba(30,22,70,.16)'}}>
      <div style={{display:'flex',alignItems:'flex-start',gap:12,marginBottom:16}}><div style={{flex:1}}><h3 className="d" style={{fontSize:28,lineHeight:1,margin:0}}>{comp.title || 'Publicar'}</h3><div className="m" style={{marginTop:6}}>Partilha uma fotografia, vídeo ou pensamento no teu Feed</div></div><button className="p composer-close" onClick={()=>setComp(null)} aria-label="Fechar" style={{padding:10}}><X size={16}/></button></div>
      <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0]||null;e.target.value='';pickMedia(f)}}/><input ref={videoInput} type="file" accept="video/mp4,video/quicktime,video/webm" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0]||null;e.target.value='';pickMedia(f)}}/>
      {file&&previewUrl?<div className="in" style={{marginBottom:14}}><div className="composer-preview" style={{position:'relative',width:'100%',aspectRatio:'4 / 5',maxHeight:'54dvh',overflow:'hidden',borderRadius:24,background:'#0B0914',boxShadow:'0 14px 36px rgba(36,28,76,.14)'}}>{isVideo?<video src={previewUrl} controls playsInline preload="metadata" aria-label="Pré-visualização do vídeo" style={{width:'100%',height:'100%',display:'block',objectFit:'contain',background:'#0B0914'}}/>:<img src={previewUrl} alt="Pré-visualização da foto" style={{width:'100%',height:'100%',display:'block',objectFit:'cover'}}/>}{!isVideo&&<><div style={{position:'absolute',inset:0,pointerEvents:'none',background:'linear-gradient(180deg,rgba(0,0,0,.16),transparent 25%,transparent 72%,rgba(0,0,0,.34))'}}/><button type="button" onClick={()=>setEditingPhoto(true)} aria-label="Editar foto" style={{position:'absolute',right:12,bottom:12,display:'flex',alignItems:'center',gap:7,border:0,borderRadius:999,padding:'10px 14px',cursor:'pointer',background:'rgba(255,255,255,.94)',color:'var(--ink)',fontWeight:700,boxShadow:'0 7px 20px rgba(0,0,0,.18)'}}><Pencil size={14}/>Editar</button></>}<span style={{position:'absolute',top:12,left:12,padding:'7px 10px',borderRadius:999,background:'rgba(10,8,25,.62)',backdropFilter:'blur(8px)',color:'#fff',fontSize:11,fontWeight:700,letterSpacing:'.03em',pointerEvents:'none'}}>{isVideo?'VÍDEO · PRONTO':'4:5 · PRONTA'}</span></div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9,marginTop:10}}><button type="button" className="p" onClick={isVideo?chooseVideo:choosePhoto} style={{justifyContent:'center'}}><RefreshCw size={14}/>Trocar</button><button type="button" className="p" onClick={removeMedia} style={{justifyContent:'center',color:'var(--coral)'}}><Trash2 size={14}/>Remover</button></div></div>:<div style={{marginBottom:14}}><div className="m" style={{margin:'0 0 8px 2px'}}>Adicionar media</div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}><button type="button" className="composer-media-picker" onClick={choosePhoto} aria-label="Adicionar fotografia" style={{minHeight:116,padding:15,border:'1.5px dashed #C8C2E4',borderRadius:23,cursor:'pointer',background:'rgba(255,255,255,.66)',color:'var(--ink)',display:'grid',placeItems:'center',gap:7}}><span style={{width:40,height:40,borderRadius:99,display:'grid',placeItems:'center',background:'#fff'}}><Image size={18}/></span><span style={{fontSize:14,fontWeight:700}}>Fotografia</span><span className="m" style={{fontSize:9.5}}>Recorta e ajusta</span></button><button type="button" className="composer-media-picker" onClick={chooseVideo} aria-label="Adicionar vídeo" style={{minHeight:116,padding:15,border:'1.5px dashed #C8C2E4',borderRadius:23,cursor:'pointer',background:'rgba(255,255,255,.66)',color:'var(--ink)',display:'grid',placeItems:'center',gap:7}}><span style={{width:40,height:40,borderRadius:99,display:'grid',placeItems:'center',background:'#fff'}}><Video size={18}/></span><span style={{fontSize:14,fontWeight:700}}>Vídeo</span><span className="m" style={{fontSize:9.5}}>MP4, MOV ou WebM</span></button></div><div className="m" style={{margin:'8px 2px 0',fontSize:9.5}}>Fotos até 8 MB · vídeos até 100 MB</div></div>}
      <div style={{position:'relative',marginBottom:16}}><textarea rows={3} value={body} onChange={e=>setBody(e.target.value)} placeholder="O que estás a ver?" style={{paddingBottom:30,resize:'none'}} maxLength={2000}/><span className="m" style={{position:'absolute',right:13,bottom:9}}>{body.length}/2000</span></div><button className="p p-brand" onClick={publish} disabled={!body.trim()||busy} style={{width:'100%',padding:15,fontSize:15}}>{busy?'A enviar…':'Publicar'}</button>
    </div></div>
    {editingPhoto&&file&&!isVideo&&<PostImageEditor file={file} onCancel={()=>setEditingPhoto(false)} onSave={edited=>{setFile(edited);setEditingPhoto(false)}}/>}
  </>;
}
