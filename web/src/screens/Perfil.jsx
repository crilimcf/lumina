import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Flag, Search, Shield, Sparkles, UserPlus, Users, X } from 'lucide-react';
import { api } from '../api.js';
import { Orb } from '../ui.jsx';
import { Nav, Toast, TopActions } from '../components/AppChrome.jsx';

function PersonRow({ person, onToggle }) {
  return <div className="card" style={{ padding: 13, display: 'flex', alignItems: 'center', gap: 11 }}>
    <Orb p={person.palette} avatarUrl={person.avatar_url} s={45} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 700, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{person.name}</div>
      <div className="m" style={{ marginTop: 2 }}>@{person.handle} · {person.followers || 0} seguidores</div>
    </div>
    <button className={person.following || person.requested ? 'p p-sm' : 'p p-sm p-brand'} onClick={() => onToggle(person)}>
      {person.following ? 'A seguir' : person.requested ? 'Pendente' : 'Seguir'}
    </button>
  </div>;
}

function ConnectionsSheet({ open, onClose, initialTab, followers, setFollowers, following, setFollowing, suggestions, setSuggestions, ping }) {
  const [tab, setTab] = useState(initialTab || 'followers');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    setTab(initialTab || 'followers');
    setQuery('');
  }, [open, initialTab]);

  const visible = useMemo(() => {
    const rows = tab === 'followers' ? followers : following;
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(person => `${person.name} ${person.handle}`.toLowerCase().includes(term));
  }, [tab, followers, following, query]);

  const toggleFollow = async (person) => {
    try {
      let result;
      if (person.following || person.requested) result = await api.users.unfollow(person.id);
      else result = await api.users.followAction(person.id);
      const next = { ...person, following: !!result.following, requested: !!result.pending };
      setFollowers(rows => rows.map(p => p.id === person.id ? next : p));
      setFollowing(rows => result.following ? [next, ...rows.filter(p => p.id !== person.id)] : rows.filter(p => p.id !== person.id));
      setSuggestions(rows => result.following ? rows.filter(p => p.id !== person.id) : [next, ...rows.filter(p => p.id !== person.id)]);
      ping(result.pending ? 'Pedido enviado' : result.following ? `Agora segues ${person.name}` : `Deixaste de seguir ${person.name}`);
    } catch (e) { ping(e.message); }
  };

  if (!open) return null;
  return <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:87, background:'rgba(16,12,38,.5)', backdropFilter:'blur(9px)', display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
    <div onClick={e=>e.stopPropagation()} className="in" style={{ width:'100%', maxWidth:520, maxHeight:'86dvh', overflow:'hidden', background:'linear-gradient(180deg,#F8F7FE,#ECE9FA)', borderRadius:'30px 30px 0 0', boxShadow:'0 -20px 64px rgba(20,18,42,.24)' }}>
      <div style={{ padding:'18px 18px 12px', background:'rgba(248,247,254,.95)', backdropFilter:'blur(16px)' }}>
        <div style={{ width:42, height:5, borderRadius:9, background:'#D7D2EA', margin:'0 auto 15px' }} />
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}><div style={{ flex:1 }}><div className="d" style={{ fontSize:27 }}>Ligações</div><div className="m" style={{ marginTop:3 }}>A tua rede, sem saíres do perfil.</div></div><button className="p" aria-label="Fechar ligações" onClick={onClose} style={{ padding:10 }}><X size={16}/></button></div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', padding:4, background:'#E7E3F5', borderRadius:16, marginBottom:12 }}>
          <button onClick={()=>{setTab('followers');setQuery('')}} style={{ border:0,borderRadius:13,padding:'10px 12px',fontWeight:750,color:tab==='followers'?'var(--ink)':'var(--grey)',background:tab==='followers'?'#fff':'transparent' }}>Seguidores · {followers.length}</button>
          <button onClick={()=>{setTab('following');setQuery('')}} style={{ border:0,borderRadius:13,padding:'10px 12px',fontWeight:750,color:tab==='following'?'var(--ink)':'var(--grey)',background:tab==='following'?'#fff':'transparent' }}>A seguir · {following.length}</button>
        </div>
        <div style={{ position:'relative' }}><Search size={17} style={{ position:'absolute',left:15,top:'50%',transform:'translateY(-50%)',color:'#9A94B7' }}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={tab==='followers'?'Pesquisar seguidores…':'Pesquisar quem segues…'} style={{ paddingLeft:43,background:'#fff' }} autoCapitalize="none" /></div>
      </div>
      <div className="ns" style={{ overflowY:'auto',maxHeight:'calc(86dvh - 190px)',padding:'6px 18px calc(26px + env(safe-area-inset-bottom))',display:'grid',gap:9 }}>
        {visible.length===0 && <div className="m" style={{ padding:22,textAlign:'center' }}>Ainda não há pessoas nesta lista.</div>}
        {visible.map(person=><PersonRow key={person.id} person={person} onToggle={toggleFollow}/>) }
      </div>
    </div>
  </div>;
}

function DiscoverySheet({ open, onClose, suggestions, setSuggestions, followers, setFollowers, following, setFollowing, ping }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => { if (open) { setQuery(''); setResults(null); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (term.length < 2) { setResults(null); setSearching(false); return; }
    let active = true;
    setSearching(true);
    const timer = setTimeout(() => api.users.search(term).then(rows => active && setResults(rows)).catch(() => active && setResults([])).finally(() => active && setSearching(false)), 250);
    return () => { active = false; clearTimeout(timer); };
  }, [open, query]);

  const toggleFollow = async (person) => {
    try {
      let result;
      if (person.following || person.requested) result = await api.users.unfollow(person.id);
      else result = await api.users.followAction(person.id);
      const next = { ...person, following: !!result.following, requested: !!result.pending };
      setResults(rows => rows && rows.map(p => p.id===person.id ? next : p));
      setSuggestions(rows => result.following ? rows.filter(p=>p.id!==person.id) : rows.map(p=>p.id===person.id?next:p));
      setFollowers(rows => rows.map(p=>p.id===person.id?next:p));
      setFollowing(rows => result.following ? [next,...rows.filter(p=>p.id!==person.id)] : rows.filter(p=>p.id!==person.id));
      ping(result.pending ? 'Pedido enviado' : result.following ? `Agora segues ${person.name}` : `Deixaste de seguir ${person.name}`);
    } catch (e) { ping(e.message); }
  };

  if (!open) return null;
  const people = results ?? suggestions;
  return <div onClick={onClose} style={{ position:'fixed',inset:0,zIndex:85,background:'rgba(16,12,38,.48)',backdropFilter:'blur(8px)',display:'flex',alignItems:'flex-end',justifyContent:'center' }}>
    <div onClick={e=>e.stopPropagation()} className="in" style={{ width:'100%',maxWidth:520,maxHeight:'88dvh',overflow:'hidden',background:'linear-gradient(180deg,#F7F6FD,#ECE9FA)',borderRadius:'30px 30px 0 0',boxShadow:'0 -18px 60px rgba(20,18,42,.22)' }}>
      <div style={{ padding:'18px 18px 12px' }}><div style={{ width:42,height:5,borderRadius:9,background:'#D7D2EA',margin:'0 auto 15px' }}/><div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:14 }}><div style={{ flex:1 }}><div className="d" style={{ fontSize:27 }}>Descobrir pessoas</div><div className="m" style={{ marginTop:3 }}>Encontra quem queres seguir.</div></div><button className="p" aria-label="Fechar descobrir" onClick={onClose} style={{ padding:10 }}><X size={16}/></button></div><div style={{ position:'relative' }}><Search size={17} style={{ position:'absolute',left:15,top:'50%',transform:'translateY(-50%)',color:'#9A94B7' }}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pesquisar pessoas…" style={{ paddingLeft:43,background:'#fff' }} autoCapitalize="none" /></div></div>
      <div className="ns" style={{ overflowY:'auto',maxHeight:'calc(88dvh - 160px)',padding:'6px 18px calc(26px + env(safe-area-inset-bottom))' }}>
        <div className="m" style={{ margin:'5px 0 10px' }}>{results!==null?'Resultados':'Pessoas que podes conhecer'}</div>
        {searching && <div className="m" style={{ padding:18,textAlign:'center' }}>A procurar…</div>}
        {!searching && people.length===0 && <div className="card" style={{ padding:20,textAlign:'center' }}><Sparkles size={20} style={{ marginBottom:8 }}/><div style={{ fontWeight:700 }}>Ainda não encontrámos ninguém.</div><div className="m" style={{ marginTop:5 }}>Experimenta outro nome.</div></div>}
        <div style={{ display:'grid',gap:9 }}>{!searching && people.map(person=><PersonRow key={person.id} person={person} onToggle={toggleFollow}/>)}</div>
      </div>
    </div>
  </div>;
}

export function Perfil({ me, blocked, setBlocked, setScreen, logout, tab, setTab, setThread, setComp, threads, ping, toast, unreadCount }) {
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [connections, setConnections] = useState(null);
  const [discover, setDiscover] = useState(false);

  useEffect(() => {
    Promise.all([api.users.followers(), api.users.following(), api.users.suggestions()])
      .then(([a,b,c]) => { setFollowers(a); setFollowing(b); setSuggestions(c); })
      .catch(() => {});
  }, []);

  const unblock = async (person) => {
    try { await api.users.unblock(person.id); setBlocked(rows=>rows.filter(x=>x.id!==person.id)); ping(`${person.name} desbloqueado`); }
    catch (e) { ping(e.message); }
  };

  return <div style={{ minHeight:'100dvh',paddingBottom:104,background:'linear-gradient(180deg,#EFEDFB,#E8E5F7)' }}>
    <main style={{ maxWidth:620,margin:'0 auto',padding:'20px 18px 30px' }}>
      <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:22 }}><h1 className="d" style={{ fontSize:36,flex:1 }}>Per<span className="it">fil</span></h1><TopActions tab={tab} setTab={setTab} setThread={setThread} unreadCount={unreadCount}/></div>

      <section className="card" style={{ padding:20 }}>
        <div style={{ display:'flex',gap:14,alignItems:'center' }}><Orb p={me.palette} avatarUrl={me.avatar_url} s={76}/><div style={{ flex:1,minWidth:0 }}><div className="d" style={{ fontSize:29,lineHeight:1 }}>{me.name}</div><div className="m" style={{ marginTop:5 }}>@{me.handle}</div></div></div>
        {me.bio && <p style={{ marginTop:15,lineHeight:1.5 }}>{me.bio}</p>}
        {me.stars?.length>0 && <div style={{ display:'flex',gap:6,flexWrap:'wrap',marginTop:13 }}>{me.stars.map(s=><span key={s} className="p p-sm" style={{ pointerEvents:'none' }}>{s}</span>)}</div>}
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:16 }}><button className="p" onClick={()=>setConnections('followers')} style={{ justifyContent:'center' }} aria-label="Ver seguidores"><Users size={15}/>{followers.length} seguidores</button><button className="p" onClick={()=>setConnections('following')} style={{ justifyContent:'center' }} aria-label="Ver a seguir"><UserPlus size={15}/>{following.length} a seguir</button></div>
        <button className="p p-brand" onClick={()=>setScreen('editar-perfil')} style={{ width:'100%',justifyContent:'center',marginTop:9 }}>Editar perfil</button>
      </section>

      <div className="m" style={{ margin:'22px 4px 9px' }}>A TUA REDE</div>
      <section className="card" style={{ padding:15,display:'grid',gap:9 }}>
        <button className="p" onClick={()=>setDiscover(true)} style={{ justifyContent:'space-between' }}><span style={{ display:'flex',alignItems:'center',gap:9 }}><Search size={16}/>Descobrir pessoas</span><ArrowUpRight size={15}/></button>
        <button className="p" onClick={()=>setTab('rooms')} style={{ justifyContent:'space-between' }}><span style={{ display:'flex',alignItems:'center',gap:9 }}><Users size={16}/>Explorar Salas</span><ArrowUpRight size={15}/></button>
      </section>

      <div className="m" style={{ margin:'22px 4px 9px' }}>CONTA & SEGURANÇA</div>
      <section className="card" style={{ padding:15,display:'grid',gap:9 }}>
        <button className="p" onClick={()=>setScreen('seguranca')} style={{ justifyContent:'space-between' }}><span style={{ display:'flex',alignItems:'center',gap:9 }}><Shield size={16}/>Segurança e sessões</span><ArrowUpRight size={15}/></button>
        {me.is_staff && <button className="p" onClick={()=>setScreen('moderacao')} style={{ justifyContent:'space-between' }}><span style={{ display:'flex',alignItems:'center',gap:9 }}><Flag size={16}/>Moderação</span><ArrowUpRight size={15}/></button>}
        <button className="p" onClick={()=>setScreen('PRIVACIDADE')} style={{ justifyContent:'space-between' }}>Privacidade <ArrowUpRight size={15}/></button>
        <button className="p" onClick={()=>setScreen('TERMOS')} style={{ justifyContent:'space-between' }}>Termos <ArrowUpRight size={15}/></button>
      </section>

      {blocked.length>0 && <><div className="m" style={{ margin:'22px 4px 9px' }}>BLOQUEADOS</div><section className="card" style={{ padding:14,display:'grid',gap:8 }}>{blocked.map(person=><div key={person.id} style={{ display:'flex',alignItems:'center',gap:10 }}><Orb p={person.palette} s={36}/><div style={{ flex:1 }}><b>{person.name}</b><div className="m">@{person.handle}</div></div><button className="p p-sm" onClick={()=>unblock(person)}>Desbloquear</button></div>)}</section></>}

      <button className="p" onClick={logout} style={{ width:'100%',justifyContent:'center',marginTop:22,color:'var(--coral)' }}>Sair</button>
    </main>
    <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} threads={threads}/>
    <Toast text={toast}/>
    <ConnectionsSheet open={!!connections} onClose={()=>setConnections(null)} initialTab={connections} followers={followers} setFollowers={setFollowers} following={following} setFollowing={setFollowing} suggestions={suggestions} setSuggestions={setSuggestions} ping={ping}/>
    <DiscoverySheet open={discover} onClose={()=>setDiscover(false)} suggestions={suggestions} setSuggestions={setSuggestions} followers={followers} setFollowers={setFollowers} following={following} setFollowing={setFollowing} ping={ping}/>
  </div>;
}
