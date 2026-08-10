import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Flag, LogOut, Pencil, Search, Shield, Sparkles, UserPlus, Users, X } from 'lucide-react';
import { api } from '../api.js';
import { Orb } from '../ui.jsx';
import { Nav, Toast, TopActions } from '../components/AppChrome.jsx';
import '../facelift.css';
import '../profileFacelift.css';

function PersonRow({ person, onToggle, onOpenProfile }) {
  const active = person.following || person.requested;
  return <div className="lumina-person-row">
    <button type="button" onClick={() => onOpenProfile?.(person)} aria-label={`Abrir perfil de ${person.name}`} style={{ border:0, background:'transparent', padding:0, cursor:'pointer', display:'grid', placeItems:'center' }}>
      <Orb p={person.palette} avatarUrl={person.avatar_url} s={43} />
    </button>
    <button type="button" onClick={() => onOpenProfile?.(person)} style={{ flex:1, minWidth:0, border:0, background:'transparent', padding:0, textAlign:'left', cursor:'pointer', color:'inherit' }}>
      <div className="lumina-person-name">{person.name}</div>
      <div className="lumina-person-meta">@{person.handle} · {person.followers || 0} seguidores</div>
    </button>
    <button className={`lumina-person-follow${active ? '' : ' lumina-person-follow-primary'}`} onClick={() => onToggle(person)}>
      {person.following ? 'A seguir' : person.requested ? 'Pendente' : 'Seguir'}
    </button>
  </div>;
}

function ConnectionsSheet({ open, onClose, initialTab, followers, setFollowers, following, setFollowing, suggestions, setSuggestions, ping, onOpenProfile }) {
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
  return <div className="lumina-profile-sheet-backdrop" onClick={onClose}>
    <div className="lumina-profile-sheet in" onClick={e => e.stopPropagation()}>
      <div className="lumina-profile-sheet-head">
        <div className="lumina-profile-sheet-grabber" />
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div className="lumina-profile-sheet-title">Ligações</div>
            <div className="lumina-profile-sheet-subtitle">A tua rede, sem saíres do perfil.</div>
          </div>
          <button className="lumina-profile-sheet-close" aria-label="Fechar ligações" onClick={onClose}><X size={17} /></button>
        </div>
        <div className="lumina-profile-sheet-tabs">
          <button className={`lumina-profile-sheet-tab${tab === 'followers' ? ' lumina-profile-sheet-tab-active' : ''}`} onClick={() => { setTab('followers'); setQuery(''); }}>Seguidores · {followers.length}</button>
          <button className={`lumina-profile-sheet-tab${tab === 'following' ? ' lumina-profile-sheet-tab-active' : ''}`} onClick={() => { setTab('following'); setQuery(''); }}>A seguir · {following.length}</button>
        </div>
        <div className="lumina-profile-search-wrap">
          <Search size={16} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder={tab === 'followers' ? 'Pesquisar seguidores…' : 'Pesquisar quem segues…'} autoCapitalize="none" />
        </div>
      </div>
      <div className="ns lumina-profile-sheet-body" style={{ display:'grid', gap:8 }}>
        {visible.length === 0 && <div className="lumina-profile-empty">Ainda não há pessoas nesta lista.</div>}
        {visible.map(person => <PersonRow key={person.id} person={person} onToggle={toggleFollow} onOpenProfile={(p) => { onClose(); onOpenProfile?.(p); }} />)}
      </div>
    </div>
  </div>;
}

function DiscoverySheet({ open, onClose, suggestions, setSuggestions, followers, setFollowers, following, setFollowing, ping, onOpenProfile }) {
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
      setResults(rows => rows && rows.map(p => p.id === person.id ? next : p));
      setSuggestions(rows => result.following ? rows.filter(p => p.id !== person.id) : rows.map(p => p.id === person.id ? next : p));
      setFollowers(rows => rows.map(p => p.id === person.id ? next : p));
      setFollowing(rows => result.following ? [next, ...rows.filter(p => p.id !== person.id)] : rows.filter(p => p.id !== person.id));
      ping(result.pending ? 'Pedido enviado' : result.following ? `Agora segues ${person.name}` : `Deixaste de seguir ${person.name}`);
    } catch (e) { ping(e.message); }
  };

  if (!open) return null;
  const people = results ?? suggestions;
  return <div className="lumina-profile-sheet-backdrop" onClick={onClose} style={{ zIndex:85 }}>
    <div className="lumina-profile-sheet in" onClick={e => e.stopPropagation()}>
      <div className="lumina-profile-sheet-head">
        <div className="lumina-profile-sheet-grabber" />
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div className="lumina-profile-sheet-title">Descobrir pessoas</div>
            <div className="lumina-profile-sheet-subtitle">Encontra novas luzes para a tua rede.</div>
          </div>
          <button className="lumina-profile-sheet-close" aria-label="Fechar descobrir" onClick={onClose}><X size={17} /></button>
        </div>
        <div className="lumina-profile-search-wrap">
          <Search size={16} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Pesquisar pessoas…" autoCapitalize="none" />
        </div>
      </div>
      <div className="ns lumina-profile-sheet-body">
        <div className="lumina-profile-sheet-label">{results !== null ? 'Resultados' : 'Pessoas que podes conhecer'}</div>
        {searching && <div className="lumina-profile-empty">A procurar…</div>}
        {!searching && people.length === 0 && <div className="lumina-profile-empty"><Sparkles size={21} style={{ marginBottom:8 }} /><div style={{ color:'#dfe1ed', fontWeight:720 }}>Ainda não encontrámos ninguém.</div><div style={{ marginTop:5 }}>Experimenta outro nome.</div></div>}
        <div style={{ display:'grid', gap:8 }}>{!searching && people.map(person => <PersonRow key={person.id} person={person} onToggle={toggleFollow} onOpenProfile={(p) => { onClose(); onOpenProfile?.(p); }} />)}</div>
      </div>
    </div>
  </div>;
}

export function Perfil({ me, blocked, setBlocked, setScreen, onOpenProfile, logout, tab, setTab, setThread, setComp, threads, ping, toast, unreadCount }) {
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [connections, setConnections] = useState(null);
  const [discover, setDiscover] = useState(false);

  useEffect(() => {
    Promise.all([api.users.followers(), api.users.following(), api.users.suggestions()])
      .then(([a, b, c]) => { setFollowers(a); setFollowing(b); setSuggestions(c); })
      .catch(() => {});
  }, []);

  const unblock = async (person) => {
    try {
      await api.users.unblock(person.id);
      setBlocked(rows => rows.filter(x => x.id !== person.id));
      ping(`${person.name} desbloqueado`);
    } catch (e) { ping(e.message); }
  };

  return <div className="lumina-facelift lumina-profile">
    <main className="lumina-profile-shell">
      <div className="lumina-profile-topbar">
        <div className="lumina-profile-topbar-copy">
          <div className="lumina-profile-kicker">O teu espaço</div>
          <h1>Perfil</h1>
        </div>
        <TopActions tab={tab} setTab={setTab} setThread={setThread} unreadCount={unreadCount} />
      </div>

      <section className="lumina-profile-hero">
        <div className="lumina-profile-identity">
          <div className="lumina-profile-avatar-shell">
            <div className="lumina-profile-avatar-inner"><Orb p={me.palette} avatarUrl={me.avatar_url} s={92} /></div>
            <span className="lumina-profile-avatar-spark" aria-hidden="true"><Sparkles size={13} /></span>
          </div>
          <div className="lumina-profile-name">{me.name}</div>
          <div className="lumina-profile-handle">@{me.handle}</div>
          {me.bio && <p className="lumina-profile-bio">{me.bio}</p>}
          {me.stars?.length > 0 && <div className="lumina-profile-stars">{me.stars.map(s => <span key={s} className="lumina-profile-star">{s}</span>)}</div>}
        </div>
        <div className="lumina-profile-stats">
          <button className="lumina-profile-stat" onClick={() => setConnections('followers')} aria-label="Ver seguidores"><strong>{followers.length}</strong><span>Seguidores</span></button>
          <button className="lumina-profile-stat" onClick={() => setConnections('following')} aria-label="Ver a seguir"><strong>{following.length}</strong><span>A seguir</span></button>
        </div>
        <button className="lumina-profile-edit" onClick={() => setScreen('editar-perfil')}><Pencil size={15} />Editar perfil</button>
      </section>

      <section className="lumina-profile-section">
        <div className="lumina-profile-section-head"><strong>Conexões</strong><span>Expande a tua comunidade</span></div>
        <div className="lumina-profile-panel">
          <button className="lumina-profile-action" onClick={() => setDiscover(true)}>
            <span className="lumina-profile-action-icon"><Search size={17} /></span>
            <span className="lumina-profile-action-copy">Descobrir pessoas<small>Sugestões e pesquisa para encontrar novas ligações.</small></span>
            <ArrowUpRight className="lumina-profile-action-chevron" size={16} />
          </button>
          <button className="lumina-profile-action" onClick={() => setTab('rooms')}>
            <span className="lumina-profile-action-icon"><Users size={17} /></span>
            <span className="lumina-profile-action-copy">Explorar Salas<small>Entra em conversas e momentos partilhados.</small></span>
            <ArrowUpRight className="lumina-profile-action-chevron" size={16} />
          </button>
        </div>
      </section>

      <section className="lumina-profile-section">
        <div className="lumina-profile-section-head"><strong>Conta & segurança</strong><span>Controlo e privacidade</span></div>
        <div className="lumina-profile-panel">
          <button className="lumina-profile-action" onClick={() => setScreen('seguranca')}>
            <span className="lumina-profile-action-icon"><Shield size={17} /></span>
            <span className="lumina-profile-action-copy">Segurança e sessões<small>Protege a tua conta e gere dispositivos ligados.</small></span>
            <ArrowUpRight className="lumina-profile-action-chevron" size={16} />
          </button>
          {me.is_staff && <button className="lumina-profile-action" onClick={() => setScreen('moderacao')}>
            <span className="lumina-profile-action-icon"><Flag size={17} /></span>
            <span className="lumina-profile-action-copy">Moderação<small>Ferramentas internas para manter a comunidade segura.</small></span>
            <ArrowUpRight className="lumina-profile-action-chevron" size={16} />
          </button>}
          <button className="lumina-profile-action" onClick={() => setScreen('PRIVACIDADE')}>
            <span className="lumina-profile-action-icon"><Shield size={17} /></span>
            <span className="lumina-profile-action-copy">Privacidade<small>Escolhe como a tua presença aparece na Lumina.</small></span>
            <ArrowUpRight className="lumina-profile-action-chevron" size={16} />
          </button>
          <button className="lumina-profile-action" onClick={() => setScreen('TERMOS')}>
            <span className="lumina-profile-action-icon"><Sparkles size={17} /></span>
            <span className="lumina-profile-action-copy">Termos<small>Consulta as regras e condições da plataforma.</small></span>
            <ArrowUpRight className="lumina-profile-action-chevron" size={16} />
          </button>
        </div>
      </section>

      {blocked.length > 0 && <section className="lumina-profile-section">
        <div className="lumina-profile-section-head"><strong>Bloqueados</strong><span>{blocked.length} {blocked.length === 1 ? 'pessoa' : 'pessoas'}</span></div>
        <div className="lumina-profile-panel">{blocked.map(person => <div key={person.id} className="lumina-profile-blocked-row"><Orb p={person.palette} avatarUrl={person.avatar_url} s={36} /><div style={{ flex:1, minWidth:0 }}><div className="lumina-person-name">{person.name}</div><div className="lumina-person-meta">@{person.handle}</div></div><button className="lumina-profile-unblock" onClick={() => unblock(person)}>Desbloquear</button></div>)}</div>
      </section>}

      <button className="lumina-profile-logout" onClick={logout}><LogOut size={16} />Sair da Lumina</button>
    </main>

    <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} threads={threads} />
    <Toast text={toast} />
    <ConnectionsSheet open={!!connections} onClose={() => setConnections(null)} initialTab={connections} followers={followers} setFollowers={setFollowers} following={following} setFollowing={setFollowing} suggestions={suggestions} setSuggestions={setSuggestions} ping={ping} onOpenProfile={onOpenProfile} />
    <DiscoverySheet open={discover} onClose={() => setDiscover(false)} suggestions={suggestions} setSuggestions={setSuggestions} followers={followers} setFollowers={setFollowers} following={following} setFollowing={setFollowing} ping={ping} onOpenProfile={onOpenProfile} />
  </div>;
}
