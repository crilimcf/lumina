import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, CheckCircle2, Crown, DoorOpen, ImagePlus, LockKeyhole, Pencil, Plus, Search, Send, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import { api } from '../api.js';
import { Empty } from '../ui.jsx';
import { Nav, Toast, TopActions } from '../components/AppChrome.jsx';
import '../interaction-polish.css';

const ULTRA_ROOMS_ENABLED = false;
const euro = cents => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format((cents || 0) / 100);
const roomTypes = [
  ['public', 'Pública', 'Qualquer pessoa Lumina pode encontrar e entrar.', DoorOpen],
  ['private', 'Privada', 'Só aparece a pessoas que convidares.', LockKeyhole],
  ...(ULTRA_ROOMS_ENABLED ? [['ultra', 'Ultra', 'Convite + pagamento. €2,99 para criar · €1,49 para entrar.', Crown]] : []),
];
const roomFilters = [['all', 'Todas'], ['public', 'Públicas'], ['private', 'Privadas'], ...(ULTRA_ROOMS_ENABLED ? [['ultra', 'Ultra']] : [])];

function AccessPill({ room }) {
  const cfg = room.visibility === 'public' ? ['Pública', DoorOpen, '#E9FFF4', '#157A4B'] : room.visibility === 'private' ? ['Privada', LockKeyhole, '#F0EEFF', '#5542C9'] : ['Ultra', Crown, '#FFF0F7', '#B82B70'];
  const [label, Icon, bg, color] = cfg;
  return <span className={`room-access-pill room-access-${room.visibility}`} style={{ display:'inline-flex',alignItems:'center',gap:5,padding:'6px 9px',borderRadius:999,background:bg,color,fontSize:10.5,fontWeight:800 }}><Icon size={12}/>{label}</span>;
}

function RoomCard({ room, me, onOpen, onRefresh, ping }) {
  const owner = room.creator_id === me.id;
  const act = async () => {
    try {
      if (room.joined && room.billing_state === 'active') return onOpen(room);
      if (owner && room.visibility === 'ultra' && room.billing_state !== 'active') {
        const out = await api.rooms.checkoutCreate(room.id);
        if (out.checkoutUrl) window.location.assign(out.checkoutUrl); else ping('Sala Ultra já ativa');
        return;
      }
      if (room.visibility === 'ultra' && !room.joined) {
        const out = await api.rooms.checkoutEntry(room.id);
        if (out.checkoutUrl) window.location.assign(out.checkoutUrl); else await api.rooms.join(room.id);
      } else await api.rooms.join(room.id);
      await onRefresh();
      const fresh = await api.rooms.get(room.id);
      if (fresh.joined) onOpen(fresh);
    } catch (e) { ping(e.message); }
  };
  const button = room.joined && room.billing_state === 'active' ? 'Entrar na sala' : owner && room.visibility === 'ultra' && room.billing_state !== 'active' ? `Ativar · ${euro(room.create_price_cents)}` : room.visibility === 'ultra' ? `Entrar · ${euro(room.entry_price_cents)}` : room.visibility === 'private' ? 'Aceitar convite' : 'Juntar-me';
  return <article className="card in room-card" style={{ overflow:'hidden',padding:0,border:0 }}><button onClick={act} style={{ width:'100%',border:0,background:'transparent',padding:0,textAlign:'left',cursor:'pointer' }}><div style={{ height:174,position:'relative',background:'linear-gradient(135deg,#1B1038,#674CFF 55%,#A446FF)',overflow:'hidden' }}>{room.image_url&&<img src={room.image_url} alt="" style={{ width:'100%',height:'100%',objectFit:'cover',display:'block' }}/>}<div style={{ position:'absolute',inset:0,background:'linear-gradient(180deg,rgba(7,4,20,.05),rgba(7,4,20,.68))' }}/><div style={{ position:'absolute',top:12,left:12 }}><AccessPill room={room}/></div><div style={{ position:'absolute',right:12,bottom:12,display:'flex',alignItems:'center',gap:6,color:'#fff',background:'rgba(5,3,16,.5)',backdropFilter:'blur(8px)',padding:'7px 10px',borderRadius:999,fontSize:11.5,fontWeight:800 }}><Users size={14}/>{room.member_count}</div><div style={{ position:'absolute',left:15,right:70,bottom:14,color:'#fff' }}><div style={{ fontSize:12,opacity:.75,marginBottom:4 }}>@{room.creator_handle}</div><div className="d" style={{ fontSize:25,lineHeight:1 }}>{room.name}</div></div></div><div style={{ padding:15 }}><div style={{ fontSize:16,fontWeight:750,lineHeight:1.28 }}>{room.topic}</div>{room.description&&<div style={{ color:'var(--grey)',fontSize:13,lineHeight:1.4,marginTop:6 }}>{room.description}</div>}<div className="p p-brand" style={{ marginTop:12,justifyContent:'center',width:'100%',padding:12 }}>{button}</div></div></button></article>;
}

function CreateRoom({ onClose, onCreated, ping }) {
  const [name,setName]=useState('');
  const [topic,setTopic]=useState('');
  const [description,setDescription]=useState('');
  const [visibility,setVisibility]=useState('public');
  const [file,setFile]=useState(null);
  const [busy,setBusy]=useState(false);
  const input=useRef(null);
  const preview=useMemo(()=>file?URL.createObjectURL(file):null,[file]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
  const create=async()=>{
    if(name.trim().length<3||topic.trim().length<3)return ping('Dá um nome e um tópico à sala');
    setBusy(true);
    try{
      const imageUrl=file?await api.upload(file):null;
      const out=await api.rooms.create({name:name.trim(),topic:topic.trim(),description:description.trim(),visibility,imageUrl});
      onCreated(out.room);
      if(out.checkoutUrl)window.location.assign(out.checkoutUrl);else if(out.paymentRequired)ping('Sala Ultra criada. Configura o pagamento Stripe para a ativar.');else ping(`Sala ${visibility==='private'?'privada':'pública'} criada`);
      onClose();
    }catch(e){ping(e.message)}finally{setBusy(false)}
  };
  return <div className="room-sheet-backdrop" onClick={()=>!busy&&onClose()} style={{ position:'fixed',inset:0,zIndex:80,background:'rgba(17,10,46,.55)',backdropFilter:'blur(7px)',display:'flex',alignItems:'flex-end' }}><div onClick={e=>e.stopPropagation()} className="in room-sheet" style={{ width:'100%',maxWidth:560,maxHeight:'94dvh',overflowY:'auto',margin:'0 auto',borderRadius:'30px 30px 0 0',background:'#F5F3FF',padding:'20px 18px calc(24px + env(safe-area-inset-bottom))' }}><div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:16 }}><div className="d" style={{ fontSize:28,flex:1 }}>Criar sala</div><button className="p" onClick={onClose} aria-label="Fechar criação da sala"><X size={16}/></button></div><input ref={input} type="file" accept="image/*" hidden onChange={e=>{setFile(e.target.files?.[0]||null);e.target.value=''}}/><button onClick={()=>input.current?.click()} style={{ width:'100%',height:150,border:'1.5px dashed rgba(190,182,223,.55)',borderRadius:22,overflow:'hidden',background:preview?'#111':'rgba(255,255,255,.05)',display:'grid',placeItems:'center',marginBottom:13,color:'inherit' }}>{preview?<img src={preview} alt="Pré-visualização da sala" style={{ width:'100%',height:'100%',objectFit:'cover',display:'block' }}/>:<span style={{ display:'grid',placeItems:'center',gap:7 }}><Camera size={24}/><b>Foto da sala</b></span>}</button><input placeholder="Nome da sala" maxLength={80} value={name} onChange={e=>setName(e.target.value)} style={{ marginBottom:10 }}/><input placeholder="Tópico principal" maxLength={180} value={topic} onChange={e=>setTopic(e.target.value)} style={{ marginBottom:10 }}/><textarea placeholder="Descrição (opcional)" maxLength={1000} rows={3} value={description} onChange={e=>setDescription(e.target.value)} style={{ width:'100%',resize:'none',marginBottom:13 }}/><div className="m" style={{ marginBottom:8 }}>Quem pode ver e entrar?</div><div className="room-privacy-grid">{roomTypes.map(([key,label,desc,Icon])=>{const selected=visibility===key;return <button key={key} type="button" aria-pressed={selected} onClick={()=>setVisibility(key)} className={`room-privacy-option is-${key}${selected?' is-selected':''}`}><span className="room-privacy-icon"><Icon size={19}/></span><span className="room-privacy-copy"><strong>{label}</strong><small>{desc}</small></span>{selected&&<span className="room-privacy-selected"><CheckCircle2 size={14}/>Selecionada</span>}</button>})}</div><button className="p p-brand" onClick={create} disabled={busy} style={{ width:'100%',padding:14,justifyContent:'center' }}>{busy?'A criar…':visibility==='ultra'?'Criar Sala Ultra · €2,99':`Criar sala ${visibility==='private'?'privada':'pública'}`}</button></div></div>;
}

function RoomChat({ room, me, onBack, onRoomUpdated, onRoomDeleted, ping }) {
  const [messages,setMessages]=useState([]);
  const [text,setText]=useState('');
  const [search,setSearch]=useState('');
  const [people,setPeople]=useState([]);
  const [showInvite,setShowInvite]=useState(false);
  const [showEdit,setShowEdit]=useState(false);
  const [showDelete,setShowDelete]=useState(false);
  const [editName,setEditName]=useState(room.name||'');
  const [editTopic,setEditTopic]=useState(room.topic||'');
  const [editDescription,setEditDescription]=useState(room.description||'');
  const [editFile,setEditFile]=useState(null);
  const [saving,setSaving]=useState(false);
  const [mediaFile,setMediaFile]=useState(null);
  const [mediaUrl,setMediaUrl]=useState(null);
  const [sending,setSending]=useState(false);
  const editImageInput=useRef(null);
  const roomMediaInput=useRef(null);
  const editObjectUrl=useMemo(()=>editFile?URL.createObjectURL(editFile):null,[editFile]);
  const mediaPreview=useMemo(()=>mediaFile?URL.createObjectURL(mediaFile):null,[mediaFile]);
  const editPreview=editObjectUrl||room.image_url||null;
  const owner=room.creator_id===me.id;

  useEffect(()=>()=>{if(editObjectUrl)URL.revokeObjectURL(editObjectUrl)},[editObjectUrl]);
  useEffect(()=>()=>{if(mediaPreview)URL.revokeObjectURL(mediaPreview)},[mediaPreview]);
  useEffect(()=>{setEditName(room.name||'');setEditTopic(room.topic||'');setEditDescription(room.description||'');setEditFile(null)},[room.id,room.name,room.topic,room.description,room.image_url]);
  useEffect(()=>{let alive=true;const load=()=>api.rooms.messages(room.id).then(r=>alive&&setMessages(r)).catch(e=>alive&&ping(e.message));load();const timer=setInterval(load,3000);return()=>{alive=false;clearInterval(timer)}},[room.id]);
  useEffect(()=>{if(!showInvite||search.trim().length<2){setPeople([]);return;}const timer=setTimeout(()=>api.users.search(search.trim()).then(setPeople).catch(()=>setPeople([])),250);return()=>clearTimeout(timer)},[search,showInvite]);

  const clearRoomMedia=()=>{if(sending)return;setMediaFile(null);setMediaUrl(null);if(roomMediaInput.current)roomMediaInput.current.value=''};
  const send=async()=>{
    const body=text.trim();
    if((!body&&!mediaFile&&!mediaUrl)||sending)return;
    setSending(true);
    try{
      let uploaded=mediaUrl;
      if(mediaFile&&!uploaded){uploaded=await api.upload(mediaFile);setMediaUrl(uploaded)}
      await api.rooms.send(room.id,body,uploaded);
      setText('');setMediaFile(null);setMediaUrl(null);if(roomMediaInput.current)roomMediaInput.current.value='';
      setMessages(await api.rooms.messages(room.id));
    }catch(e){ping(e.message)}finally{setSending(false)}
  };
  const remove=async m=>{try{await api.rooms.removeMessage(room.id,m.id);setMessages(x=>x.filter(v=>v.id!==m.id))}catch(e){ping(e.message)}};
  const saveRoom=async()=>{const name=editName.trim();const topic=editTopic.trim();if(name.length<3||topic.length<3)return ping('Dá um nome e um tópico à sala');setSaving(true);try{const payload={name,topic,description:editDescription.trim()};if(editFile)payload.imageUrl=await api.upload(editFile);const updated=await api.rooms.update(room.id,payload);onRoomUpdated(updated);setEditFile(null);setShowEdit(false);ping('Sala atualizada')}catch(e){ping(e.message)}finally{setSaving(false)}};
  const deleteRoom=async()=>{setSaving(true);try{await api.rooms.remove(room.id);setShowDelete(false);ping('Sala apagada');onRoomDeleted()}catch(e){ping(e.message);setSaving(false)}};

  return <div className="lumina-facelift lumina-room-chat" style={{ height:'100dvh',display:'flex',flexDirection:'column',background:'var(--paper)' }}>
    <header className="room-chat-header" style={{ padding:'12px 14px',display:'flex',alignItems:'center',gap:8,borderBottom:'1px solid #E1DDF0' }}><button className="p" onClick={onBack} aria-label="Voltar às salas"><ArrowLeft size={16}/></button><div style={{ width:42,height:42,borderRadius:14,overflow:'hidden',background:'#25154F',flexShrink:0 }}>{room.image_url&&<img src={room.image_url} alt="" style={{ width:'100%',height:'100%',objectFit:'cover',display:'block' }}/>}</div><div style={{ flex:1,minWidth:0 }}><b style={{ display:'block',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{room.name}</b><span className="m" style={{ display:'block',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{room.topic}</span></div>{owner&&<button className="p" onClick={()=>{setEditFile(null);setShowEdit(true)}} aria-label="Editar sala"><Pencil size={16}/></button>}{owner&&room.visibility!=='public'&&<button className="p" onClick={()=>setShowInvite(v=>!v)} aria-label="Convidar pessoas"><Plus size={17}/></button>}{owner&&<button className="p" onClick={()=>setShowDelete(true)} aria-label="Apagar sala"><Trash2 size={16}/></button>}</header>
    {showInvite&&<div className="room-invite-panel" style={{ padding:12,borderBottom:'1px solid #E1DDF0' }}><div style={{ position:'relative' }}><Search size={15} style={{ position:'absolute',left:11,top:12 }}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Procurar utilizador" style={{ paddingLeft:34 }}/></div>{people.map(p=><button key={p.id} className="p" onClick={async()=>{try{await api.rooms.invite(room.id,p.id);ping(`Convite enviado a ${p.name}`);setSearch('');setPeople([])}catch(e){ping(e.message)}}} style={{ width:'100%',marginTop:7,justifyContent:'space-between' }}><span>{p.name} · @{p.handle}</span><Plus size={14}/></button>)}</div>}
    <div className="room-messages" style={{ flex:1,overflowY:'auto',padding:14,display:'flex',flexDirection:'column',gap:9 }}>{messages.length===0&&<Empty>A sala está silenciosa.<br/>Diz qualquer coisa.</Empty>}{messages.map(m=>{const video=String(m.media_mime||'').startsWith('video/');return <div key={m.id} className={`card room-message${m.sender_id===me.id?' room-message-me':''}`} style={{ padding:11,alignSelf:m.sender_id===me.id?'flex-end':'flex-start',maxWidth:'86%' }}><div className="m" style={{ marginBottom:4 }}>{m.name||`@${m.handle}`}</div>{m.media_url&&(video?<video className="room-message-media is-video" src={m.media_url} controls playsInline preload="metadata"/>:<img className="room-message-media" src={m.media_url} alt="" loading="lazy"/>)}{m.body&&<div style={{ marginTop:m.media_url?8:0 }}>{m.body}</div>}{(m.sender_id===me.id||owner)&&<button onClick={()=>remove(m)} aria-label="Apagar mensagem" style={{ border:0,background:'transparent',color:'var(--coral)',fontSize:10,marginTop:6,padding:0 }}>Apagar</button>}</div>})}</div>
    <div className="room-composer-wrap">
      <input ref={roomMediaInput} type="file" hidden disabled={sending} accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" onChange={e=>{const picked=e.target.files?.[0]||null;e.target.value='';if(picked){setMediaFile(picked);setMediaUrl(null)}}}/>
      {(mediaFile||mediaUrl)&&<div className="room-media-ready"><span>{mediaFile?.type?.startsWith('video/')?'🎥':'📷'}</span><span className="room-media-ready-name">{mediaFile?.name||'Media pronta para enviar'}</span><button type="button" className="messages-media-remove" onClick={clearRoomMedia} disabled={sending} aria-label="Remover foto ou vídeo"><X size={15}/></button></div>}
      <div className="room-composer-row"><button type="button" className="room-media-picker" onClick={()=>roomMediaInput.current?.click()} disabled={sending} aria-label="Adicionar foto ou vídeo à sala"><ImagePlus size={18}/></button><input placeholder="Mensagem para a sala…" value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} disabled={sending}/><button className="room-send-button" aria-label="Enviar para a sala" onClick={send} disabled={sending||(!text.trim()&&!mediaFile&&!mediaUrl)}>{sending?'…':<Send size={17}/>}</button></div>
    </div>
    {showEdit&&<div className="room-dialog-backdrop" style={{ position:'fixed',inset:0,zIndex:120,background:'rgba(15,10,35,.52)',display:'grid',placeItems:'center',padding:18 }}><div className="card room-dialog" style={{ width:'100%',maxWidth:420,maxHeight:'92dvh',overflowY:'auto',padding:18 }}><div className="d" style={{ fontSize:25,marginBottom:12 }}>Editar sala</div><input ref={editImageInput} type="file" accept="image/*" hidden onChange={e=>{setEditFile(e.target.files?.[0]||null);e.target.value=''}}/><button onClick={()=>editImageInput.current?.click()} style={{ width:'100%',height:130,border:'1.5px dashed #BEB6DF',borderRadius:20,overflow:'hidden',background:editPreview?'#111':'#fff',display:'grid',placeItems:'center',marginBottom:10,color:'var(--ink)' }}>{editPreview?<div style={{ width:'100%',height:'100%',position:'relative' }}><img src={editPreview} alt="Pré-visualização da sala" style={{ width:'100%',height:'100%',objectFit:'cover',display:'block' }}/><span style={{ position:'absolute',right:10,bottom:10,display:'inline-flex',alignItems:'center',gap:6,padding:'7px 10px',borderRadius:999,background:'rgba(10,7,24,.72)',color:'#fff',fontSize:11,fontWeight:800 }}><Camera size={14}/> Alterar foto</span></div>:<span style={{ display:'grid',placeItems:'center',gap:7 }}><Camera size={23}/><b>Adicionar foto à sala</b></span>}</button><input placeholder="Nome da sala" value={editName} onChange={e=>setEditName(e.target.value)} style={{ marginBottom:9 }}/><input placeholder="Tópico principal" value={editTopic} onChange={e=>setEditTopic(e.target.value)} style={{ marginBottom:9 }}/><textarea placeholder="Descrição (opcional)" value={editDescription} onChange={e=>setEditDescription(e.target.value)} rows={3} style={{ width:'100%',resize:'none' }}/><div style={{ display:'flex',gap:8,marginTop:12 }}><button className="p" onClick={()=>{setEditFile(null);setShowEdit(false)}}>Cancelar</button><button className="p p-brand" onClick={saveRoom} disabled={saving}>{saving?'A guardar…':'Guardar alterações'}</button></div></div></div>}
    {showDelete&&<div className="room-dialog-backdrop" role="dialog" aria-label="Confirmar apagar sala" style={{ position:'fixed',inset:0,zIndex:125,background:'rgba(15,10,35,.58)',display:'grid',placeItems:'center',padding:18 }}><div className="card room-dialog" style={{ width:'100%',maxWidth:380,padding:18 }}><div className="d" style={{ fontSize:25 }}>Apagar sala?</div><div className="m" style={{ margin:'8px 0 15px' }}>As mensagens e media desta sala também serão removidas.</div><div style={{ display:'flex',gap:8 }}><button className="p" onClick={()=>setShowDelete(false)}>Cancelar</button><button className="p" onClick={deleteRoom} disabled={saving} style={{ color:'var(--coral)' }}>Apagar sala</button></div></div></div>}
  </div>;
}

export function Salas({ me,tab,setTab,setComp,threads,setThread,ping,toast,unreadCount }) {
  const [rooms,setRooms]=useState([]);
  const [active,setActive]=useState(null);
  const [creating,setCreating]=useState(false);
  const [filter,setFilter]=useState('all');
  const load=async()=>{try{setRooms(await api.rooms.list())}catch(e){ping(e.message)}};
  useEffect(()=>{load()},[]);
  const visible=rooms.filter(r=>(ULTRA_ROOMS_ENABLED||r.visibility!=='ultra')&&(filter==='all'||r.visibility===filter));
  if(active)return <RoomChat room={active} me={me} onBack={()=>{setActive(null);load()}} onRoomUpdated={room=>{setActive(room);setRooms(rows=>rows.map(r=>r.id===room.id?{...r,...room}:r))}} onRoomDeleted={()=>{setActive(null);load()}} ping={ping}/>;
  return <div className="lumina-facelift lumina-rooms" style={{ minHeight:'100dvh',paddingBottom:100 }}><div className="rooms-shell" style={{ maxWidth:620,margin:'0 auto',padding:'20px 16px' }}><div className="rooms-header" style={{ display:'flex',alignItems:'center',gap:8,margin:'4px 0 10px' }}><div style={{ flex:1 }}><h2 className="d" style={{ fontSize:40,margin:0 }}>Sa<span className="it">las</span></h2><div className="m" style={{ marginTop:4 }}>Tópicos vivos, sem poluir o Feed.</div></div><button className="p p-brand p-sm" onClick={()=>setCreating(true)}><Plus size={15}/> Criar</button><TopActions tab={tab} setTab={setTab} setThread={setThread} unreadCount={unreadCount}/></div><div className="rooms-filters" style={{ display:'flex',gap:7,overflowX:'auto',padding:'9px 0 15px' }}>{roomFilters.map(([k,l])=><button key={k} onClick={()=>setFilter(k)} className={`p p-sm${filter===k?' p-ink':''}`} style={{ flexShrink:0 }}>{l}</button>)}</div>{visible.length===0?<Empty>Não há salas nesta categoria.<br/>Cria a primeira.</Empty>:<div className="rooms-grid" style={{ display:'grid',gap:13 }}>{visible.map(room=><RoomCard key={room.id} room={room} me={me} onOpen={setActive} onRefresh={load} ping={ping}/>)}</div>}<div className="card rooms-privacy" style={{ padding:14,marginTop:16,display:'flex',gap:10,alignItems:'center' }}><ShieldCheck size={20} color="var(--cobalt)"/><div style={{ fontSize:12.5,lineHeight:1.4 }}><b>Privacidade real.</b> Salas privadas só aparecem a pessoas convidadas por quem as criou.</div></div></div><Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} threads={threads}/><Toast text={toast}/>{creating&&<CreateRoom onClose={()=>setCreating(false)} onCreated={room=>setRooms(current=>[room,...current])} ping={ping}/>}</div>;
}
