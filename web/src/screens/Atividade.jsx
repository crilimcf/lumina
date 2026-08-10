import React, { useEffect, useState } from 'react';
import { Bell, Check, DoorOpen, FileText, Globe2, Lock, MessageCircle, Phone, Search, UserPlus, X } from 'lucide-react';
import { api } from '../api.js';
import { Orb } from '../ui.jsx';
import { Nav, Toast } from '../components/AppChrome.jsx';

const relativeTime = (value) => {
  if (!value) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'agora';
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} d`;
};

const iconFor = (type) => {
  if (type === 'new_post') return FileText;
  if (type === 'new_room' || type === 'room_invite') return DoorOpen;
  if (type === 'follow_request' || type === 'follow_accepted' || type === 'new_follower') return UserPlus;
  if (type === 'message') return MessageCircle;
  if (type === 'incoming_call') return Phone;
  return Bell;
};

function notificationText(n) {
  const name = n.actor_name || 'Alguém';
  if (n.type === 'follow_request') return `${name} quer seguir-te`;
  if (n.type === 'follow_accepted') return `${name} aceitou o teu pedido`;
  if (n.type === 'new_follower') return `${name} começou a seguir-te`;
  if (n.type === 'new_post') return `${name} publicou algo novo`;
  if (n.type === 'new_room') return `${name} criou a sala ${n.room_name || ''}`.trim();
  if (n.type === 'room_invite') return `${name} convidou-te para ${n.room_name || 'uma sala'}`;
  if (n.type === 'message') return `${name} enviou-te uma mensagem`;
  if (n.type === 'incoming_call') return `${name} ${n.data?.mode === 'video' ? 'fez uma videochamada' : 'ligou-te'}`;
  return 'Tens uma novidade';
}

function ProfileView({ person, posts, loadingPosts, onBack, onToggleFollow }) {
  if (!person) return null;
  const locked = person.is_private && !person.can_view_posts;
  return <div style={{ padding:'calc(18px + env(safe-area-inset-top)) 18px 112px',maxWidth:720,margin:'0 auto' }}>
    <button className="p" onClick={onBack} style={{ marginBottom:18 }}>← Voltar</button>
    <div className="card" style={{ padding:20 }}><div style={{ display:'flex',gap:14,alignItems:'center' }}><Orb p={person.palette} avatarUrl={person.avatar_url} s={72}/><div style={{ flex:1,minWidth:0 }}><div className="d" style={{ fontSize:28,lineHeight:1.05 }}>{person.name}</div><div className="m" style={{ marginTop:5 }}>@{person.handle}</div><div className="m" style={{ marginTop:5,display:'flex',gap:12,flexWrap:'wrap' }}><span>{person.followers||0} seguidores</span><span>{person.following_count||0} a seguir</span><span style={{ display:'inline-flex',gap:5,alignItems:'center' }}>{person.is_private?<Lock size={12}/>:<Globe2 size={12}/>} {person.is_private?'Privado':'Público'}</span></div></div></div>{person.bio&&<div style={{ marginTop:15,lineHeight:1.5 }}>{person.bio}</div>}<button className={person.following||person.requested?'p':'p p-brand'} onClick={()=>onToggleFollow(person)} style={{ width:'100%',marginTop:16 }}>{person.following?'A seguir':person.requested?'Pedido enviado':person.is_private?'Pedir para seguir':'Seguir'}</button></div>
    <div style={{ marginTop:18 }}><div className="d" style={{ fontSize:22,marginBottom:10 }}>Publicações</div>{locked&&<div className="card" style={{ padding:28,textAlign:'center' }}><Lock size={28} style={{ marginBottom:9 }}/><div style={{ fontWeight:800 }}>Este perfil é privado.</div><div className="m" style={{ marginTop:6 }}>Quando o pedido for aceite, as publicações ficam visíveis aqui.</div></div>}{!locked&&loadingPosts&&<div className="m" style={{ padding:22,textAlign:'center' }}>A carregar publicações…</div>}{!locked&&!loadingPosts&&posts.length===0&&<div className="card" style={{ padding:24,textAlign:'center' }}><div style={{ fontWeight:750 }}>Ainda não há publicações visíveis.</div><div className="m" style={{ marginTop:5 }}>Quando esta pessoa publicar no Feed, aparece aqui.</div></div>}{!locked&&<div style={{ display:'grid',gap:12 }}>{posts.map(post=><div className="card" key={post.id} style={{ overflow:'hidden' }}>{post.media_url&&((post.media_mime||'').startsWith('video/')?<video src={post.media_url} controls playsInline style={{ width:'100%',maxHeight:420,display:'block',background:'#0B0914' }}/>:<img src={post.media_url} alt="" style={{ width:'100%',maxHeight:440,display:'block',objectFit:'cover' }}/>) }<div style={{ padding:16 }}><div style={{ whiteSpace:'pre-wrap',lineHeight:1.5 }}>{post.body}</div><div className="m" style={{ marginTop:9 }}>{post.likes||0} gostos · {post.comments||0} comentários</div></div></div>)}</div>}</div>
  </div>;
}

export function Atividade({ tab,setTab,setThread,setComp,threads,ping,toast,unreadCount=0,onUnreadChange }) {
  const [section,setSection]=useState('alerts');
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(true);
  const [privacy,setPrivacy]=useState(false);
  const [privacyBusy,setPrivacyBusy]=useState(false);
  const [query,setQuery]=useState('');
  const [results,setResults]=useState([]);
  const [searching,setSearching]=useState(false);
  const [person,setPerson]=useState(null);
  const [posts,setPosts]=useState([]);
  const [loadingPosts,setLoadingPosts]=useState(false);

  const load=async()=>{setLoading(true);try{const [activity,p]=await Promise.all([api.notifications.list(),api.users.privacy()]);setItems(activity.notifications||[]);setPrivacy(!!p.isPrivate);onUnreadChange?.((activity.notifications||[]).filter(n=>!n.read_at).length);}catch(e){ping(e.message)}finally{setLoading(false)}};
  useEffect(()=>{load()},[]);
  useEffect(()=>{if(section!=='people')return;const term=query.trim();if(term.length<2){setResults([]);setSearching(false);return;}let active=true;setSearching(true);const timer=setTimeout(()=>api.users.search(term).then(rows=>active&&setResults(rows)).catch(()=>active&&setResults([])).finally(()=>active&&setSearching(false)),220);return()=>{active=false;clearTimeout(timer)}},[query,section]);

  const syncUnread=rows=>onUnreadChange?.(rows.filter(n=>!n.read_at).length);
  const markRead=async n=>{if(n.read_at)return;try{await api.notifications.read(n.id)}catch{return}setItems(rows=>{const next=rows.map(x=>x.id===n.id?{...x,read_at:new Date().toISOString()}:x);syncUnread(next);return next})};
  const openPerson=async handle=>{if(!handle)return;setLoadingPosts(true);try{const p=await api.users.get(handle);setPerson(p);if(p.can_view_posts){const data=await api.users.posts(handle);setPosts(data.posts||[])}else setPosts([])}catch(e){ping(e.message)}finally{setLoadingPosts(false)}};
  const toggleFollow=async target=>{try{const result=target.following||target.requested?await api.users.unfollow(target.id):await api.users.followAction(target.id);const next={...target,following:!!result.following,requested:!!result.pending};setResults(rows=>rows.map(r=>r.id===target.id?next:r));if(person?.id===target.id){const refreshed=await api.users.get(target.handle);setPerson(refreshed);if(refreshed.can_view_posts){const data=await api.users.posts(target.handle);setPosts(data.posts||[])}else setPosts([])}ping(result.pending?'Pedido enviado':result.following?`Agora segues ${target.name}`:'Pedido/seguimento removido')}catch(e){ping(e.message)}};
  const answerRequest=async(n,accept)=>{try{if(accept)await api.users.acceptRequest(n.follow_request_id);else await api.users.declineRequest(n.follow_request_id);await api.notifications.read(n.id).catch(()=>{});setItems(rows=>{const next=rows.map(item=>item.id===n.id?{...item,read_at:item.read_at||new Date().toISOString(),follow_request_status:accept?'accepted':'declined'}:item);syncUnread(next);return next});ping(accept?'Pedido aceite':'Pedido recusado')}catch(e){ping(e.message)}};
  const openConversation=async n=>{const existing=threads.find(t=>t.id===n.data?.threadId||t.other_id===n.actor_id);if(existing){setThread({id:existing.id,name:existing.name,handle:existing.handle,palette:existing.palette,avatar_url:existing.avatar_url,other_id:existing.other_id});setTab('dms');return;}if(n.actor_id){try{const created=await api.messages.openThread(n.actor_id);setThread({id:created.id,name:n.actor_name,handle:n.actor_handle,palette:n.actor_palette,avatar_url:n.actor_avatar_url,other_id:n.actor_id});setTab('dms')}catch(e){ping(e.message)}}};
  const openNotification=async n=>{await markRead(n);if(n.type==='message'||n.type==='incoming_call')return openConversation(n);if(n.type==='new_room'||n.type==='room_invite')return setTab('rooms');if(n.actor_handle)return openPerson(n.actor_handle)};
  const changePrivacy=async()=>{const next=!privacy;setPrivacyBusy(true);try{const result=await api.users.setPrivacy(next);setPrivacy(!!result.isPrivate);ping(result.isPrivate?'Perfil privado ativado':'Perfil público ativado');await load()}catch(e){ping(e.message)}finally{setPrivacyBusy(false)}};
  const markAll=async()=>{try{await api.notifications.readAll();setItems(rows=>rows.map(n=>({...n,read_at:n.read_at||new Date().toISOString()})));onUnreadChange?.(0)}catch(e){ping(e.message)}};

  const unread=items.filter(n=>!n.read_at).length;
  const pendingRequests=items.filter(n=>n.type==='follow_request'&&n.follow_request_status==='pending');
  if(person)return <><ProfileView person={person} posts={posts} loadingPosts={loadingPosts} onBack={()=>{setPerson(null);setPosts([])}} onToggleFollow={toggleFollow}/><Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} threads={threads}/><Toast text={toast}/></>;

  return <div style={{ minHeight:'100dvh',paddingBottom:102 }}><main style={{ maxWidth:720,margin:'0 auto',padding:'calc(20px + env(safe-area-inset-top)) 18px 28px' }}>
    <div style={{ display:'flex',alignItems:'flex-end',gap:12,marginBottom:18 }}><div style={{ flex:1 }}><div className="d" style={{ fontSize:34 }}>Atividade</div><div className="m" style={{ marginTop:4 }}>{unread?`${unread} novidade${unread===1?'':'s'} por ver`:'Tudo em dia.'}</div></div>{unread>0&&<button className="p p-sm" onClick={markAll}><Check size={14}/>Ler tudo</button>}</div>
    <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:5,padding:5,borderRadius:18,background:'#E7E3F5',marginBottom:16 }}><button onClick={()=>setSection('alerts')} style={{ border:0,borderRadius:14,padding:11,fontWeight:800,background:section==='alerts'?'#fff':'transparent',color:'var(--ink)' }}>Alertas {pendingRequests.length?`· ${pendingRequests.length}`:''}</button><button onClick={()=>setSection('people')} style={{ border:0,borderRadius:14,padding:11,fontWeight:800,background:section==='people'?'#fff':'transparent',color:'var(--ink)' }}>Pessoas & privacidade</button></div>
    {section==='alerts'?<>{loading&&<div className="m" style={{ padding:25,textAlign:'center' }}>A carregar atividade…</div>}{!loading&&items.length===0&&<div className="card" style={{ padding:30,textAlign:'center' }}><Bell size={28} style={{ marginBottom:9 }}/><div style={{ fontWeight:800 }}>Ainda não tens alertas.</div><div className="m" style={{ marginTop:5 }}>Pedidos, mensagens, publicações e Salas vão aparecer aqui.</div></div>}<div style={{ display:'grid',gap:9 }}>{items.map(n=>{const I=iconFor(n.type);const pending=n.type==='follow_request'&&n.follow_request_status==='pending';return <div key={n.id} className="card" style={{ padding:13,display:'flex',gap:11,alignItems:'flex-start',border:!n.read_at?'1.5px solid rgba(77,62,255,.28)':undefined }}><button onClick={()=>openNotification(n)} aria-label="Abrir notificação" style={{ width:45,height:45,flexShrink:0,border:0,borderRadius:16,background:'#17132F',color:'#fff',display:'grid',placeItems:'center' }}><I size={19}/></button><div style={{ flex:1,minWidth:0 }}><button onClick={()=>openNotification(n)} style={{ padding:0,border:0,background:'transparent',textAlign:'left',color:'inherit',width:'100%' }}><div style={{ fontWeight:800,lineHeight:1.35 }}>{notificationText(n)}</div><div className="m" style={{ marginTop:4,display:'flex',alignItems:'center',gap:7 }}>{relativeTime(n.created_at)}<span style={{ fontSize:9.5,fontWeight:900,letterSpacing:'.05em',textTransform:'uppercase',padding:'2px 6px',borderRadius:999,background:n.read_at?'#EDF5F0':'#ECE9FF',color:n.read_at?'#47705D':'var(--cobalt)' }}>{n.read_at?'Lida':'Não lida'}</span></div></button>{pending&&<div style={{ display:'flex',gap:7,marginTop:9 }}><button className="p p-brand p-sm" onClick={()=>answerRequest(n,true)}>Aceitar</button><button className="p p-sm" onClick={()=>answerRequest(n,false)}>Recusar</button></div>}</div>{!n.read_at&&<span style={{ width:8,height:8,borderRadius:8,background:'var(--cobalt)',marginTop:6 }}/>}</div>})}</div></>:<><div className="card" style={{ padding:16,marginBottom:13 }}><div style={{ display:'flex',gap:11,alignItems:'center' }}><span style={{ width:42,height:42,borderRadius:15,display:'grid',placeItems:'center',background:privacy?'#ECE9FF':'#E9FFF4' }}>{privacy?<Lock size={18}/>:<Globe2 size={18}/>}</span><div style={{ flex:1 }}><b>{privacy?'Perfil privado':'Perfil público'}</b><div className="m" style={{ marginTop:3 }}>{privacy?'Só seguidores aceites veem as tuas publicações.':'Qualquer pessoa pode ver o teu perfil; o Feed mostra quem segues.'}</div></div></div><button className="p p-sm" disabled={privacyBusy} onClick={changePrivacy} style={{ width:'100%',justifyContent:'center',marginTop:12 }}>{privacyBusy?'A guardar…':privacy?'Tornar público':'Tornar privado'}</button></div><div style={{ position:'relative',marginBottom:12 }}><Search size={16} style={{ position:'absolute',left:13,top:13,color:'var(--grey)' }}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pesquisar pessoas…" style={{ paddingLeft:38 }}/>{query&&<button aria-label="Limpar pesquisa" onClick={()=>setQuery('')} style={{ position:'absolute',right:10,top:9,border:0,background:'transparent' }}><X size={16}/></button>}</div>{searching&&<div className="m" style={{ padding:18,textAlign:'center' }}>A pesquisar…</div>}<div style={{ display:'grid',gap:9 }}>{results.map(p=><div key={p.id} className="card" style={{ padding:12,display:'flex',gap:10,alignItems:'center' }}><button onClick={()=>openPerson(p.handle)} style={{ border:0,background:'transparent',padding:0 }}><Orb p={p.palette} avatarUrl={p.avatar_url} s={44}/></button><button onClick={()=>openPerson(p.handle)} style={{ flex:1,minWidth:0,border:0,background:'transparent',textAlign:'left',color:'inherit',padding:0 }}><b style={{ display:'block' }}>{p.name}</b><span className="m">@{p.handle} · {p.followers||0} seguidores</span></button><button className={p.following||p.requested?'p p-sm':'p p-brand p-sm'} onClick={()=>toggleFollow(p)}>{p.following?'A seguir':p.requested?'Pendente':'Seguir'}</button></div>)}</div></>}
  </main><Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} threads={threads}/><Toast text={toast}/></div>;
}
