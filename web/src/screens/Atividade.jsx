import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Bell, Check, DoorOpen, FileText, Globe2, Lock, MessageCircle,
  Phone, Search, Sparkles, UserPlus, X,
} from 'lucide-react';
import { api } from '../api.js';
import { Orb } from '../ui.jsx';
import { Nav, Toast, TopActions } from '../components/AppChrome.jsx';
import '../facelift.css';
import '../activity-facelift.css';

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
  const following = person.following || person.requested;

  return <div className="lumina-facelift lumina-activity-profile">
    <div className="activity-profile-shell">
      <button type="button" className="activity-profile-back" onClick={onBack}>
        <ArrowLeft size={15}/> Voltar
      </button>

      <section className="activity-profile-hero">
        <div className="activity-profile-top">
          <span className="activity-avatar-halo"><Orb p={person.palette} avatarUrl={person.avatar_url} s={72}/></span>
          <div style={{ flex:1, minWidth:0 }}>
            <div className="activity-profile-name">{person.name}</div>
            <div className="activity-profile-handle">@{person.handle}</div>
            <div className="activity-profile-stats">
              <span>{person.followers || 0} seguidores</span>
              <span>{person.following_count || 0} a seguir</span>
              <span className="activity-profile-stat-privacy">
                {person.is_private ? <Lock size={11}/> : <Globe2 size={11}/>} {person.is_private ? 'Privado' : 'Público'}
              </span>
            </div>
          </div>
        </div>

        {person.bio && <div className="activity-profile-bio">{person.bio}</div>}
        <button
          type="button"
          className={`activity-profile-follow ${following ? 'is-muted' : 'is-primary'}`}
          onClick={()=>onToggleFollow(person)}
        >
          {person.following ? 'A seguir' : person.requested ? 'Pedido enviado' : person.is_private ? 'Pedir para seguir' : 'Seguir'}
        </button>
      </section>

      <section className="activity-profile-posts">
        <div className="activity-profile-posts-title">Publicações</div>

        {locked && <div className="activity-profile-state">
          <Lock size={27}/>
          <strong>Este perfil é privado.</strong>
          <p>Quando o pedido for aceite, as publicações ficam visíveis aqui.</p>
        </div>}

        {!locked && loadingPosts && <div className="activity-profile-state">A carregar publicações…</div>}

        {!locked && !loadingPosts && posts.length === 0 && <div className="activity-profile-state">
          <Sparkles size={25}/>
          <strong>Ainda não há publicações visíveis.</strong>
          <p>Quando esta pessoa publicar no Feed, aparece aqui.</p>
        </div>}

        {!locked && <div className="activity-profile-post-grid">
          {posts.map(post => <article className="activity-profile-post" key={post.id}>
            {post.media_url && ((post.media_mime || '').startsWith('video/')
              ? <video src={post.media_url} controls playsInline/>
              : <img src={post.media_url} alt=""/>)}
            <div className="activity-profile-post-body">
              {post.body}
              <div className="activity-profile-post-meta">{post.likes || 0} gostos · {post.comments || 0} comentários</div>
            </div>
          </article>)}
        </div>}
      </section>
    </div>
  </div>;
}

export function Atividade({
  tab, setTab, setThread, setComp, threads, ping, toast, unreadCount = 0, onUnreadChange,
}) {
  const [section, setSection] = useState('alerts');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [privacy, setPrivacy] = useState(false);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [person, setPerson] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [activity, p] = await Promise.all([api.notifications.list(), api.users.privacy()]);
      setItems(activity.notifications || []);
      setPrivacy(!!p.isPrivate);
      onUnreadChange?.((activity.notifications || []).filter(n => !n.read_at).length);
    } catch (e) {
      ping(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (section !== 'people') return;
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const timer = setTimeout(() => api.users.search(term)
      .then(rows => active && setResults(rows))
      .catch(() => active && setResults([]))
      .finally(() => active && setSearching(false)), 220);
    return () => { active = false; clearTimeout(timer); };
  }, [query, section]);

  const syncUnread = rows => onUnreadChange?.(rows.filter(n => !n.read_at).length);

  const markRead = async n => {
    if (n.read_at) return;
    try { await api.notifications.read(n.id); } catch { return; }
    setItems(rows => {
      const next = rows.map(x => x.id === n.id ? { ...x, read_at:new Date().toISOString() } : x);
      syncUnread(next);
      return next;
    });
  };

  const openPerson = async handle => {
    if (!handle) return;
    setLoadingPosts(true);
    try {
      const p = await api.users.get(handle);
      setPerson(p);
      if (p.can_view_posts) {
        const data = await api.users.posts(handle);
        setPosts(data.posts || []);
      } else setPosts([]);
    } catch (e) {
      ping(e.message);
    } finally {
      setLoadingPosts(false);
    }
  };

  const toggleFollow = async target => {
    try {
      const result = target.following || target.requested
        ? await api.users.unfollow(target.id)
        : await api.users.followAction(target.id);
      const next = { ...target, following:!!result.following, requested:!!result.pending };
      setResults(rows => rows.map(r => r.id === target.id ? next : r));
      if (person?.id === target.id) {
        const refreshed = await api.users.get(target.handle);
        setPerson(refreshed);
        if (refreshed.can_view_posts) {
          const data = await api.users.posts(target.handle);
          setPosts(data.posts || []);
        } else setPosts([]);
      }
      ping(result.pending ? 'Pedido enviado' : result.following ? `Agora segues ${target.name}` : 'Pedido/seguimento removido');
    } catch (e) {
      ping(e.message);
    }
  };

  const answerRequest = async (n, accept) => {
    try {
      if (accept) await api.users.acceptRequest(n.follow_request_id);
      else await api.users.declineRequest(n.follow_request_id);
      await api.notifications.read(n.id).catch(()=>{});
      setItems(rows => {
        const next = rows.map(item => item.id === n.id
          ? { ...item, read_at:item.read_at || new Date().toISOString(), follow_request_status:accept ? 'accepted' : 'declined' }
          : item);
        syncUnread(next);
        return next;
      });
      ping(accept ? 'Pedido aceite' : 'Pedido recusado');
    } catch (e) {
      ping(e.message);
    }
  };

  const openConversation = async n => {
    const existing = threads.find(t => t.id === n.data?.threadId || t.other_id === n.actor_id);
    if (existing) {
      setThread({
        id:existing.id, name:existing.name, handle:existing.handle, palette:existing.palette,
        avatar_url:existing.avatar_url, other_id:existing.other_id,
      });
      setTab('dms');
      return;
    }
    if (n.actor_id) {
      try {
        const created = await api.messages.openThread(n.actor_id);
        setThread({
          id:created.id, name:n.actor_name, handle:n.actor_handle, palette:n.actor_palette,
          avatar_url:n.actor_avatar_url, other_id:n.actor_id,
        });
        setTab('dms');
      } catch (e) {
        ping(e.message);
      }
    }
  };

  const openNotification = async n => {
    await markRead(n);
    if (n.type === 'message' || n.type === 'incoming_call') return openConversation(n);
    if (n.type === 'new_room' || n.type === 'room_invite') return setTab('rooms');
    if (n.actor_handle) return openPerson(n.actor_handle);
  };

  const changePrivacy = async () => {
    const next = !privacy;
    setPrivacyBusy(true);
    try {
      const result = await api.users.setPrivacy(next);
      setPrivacy(!!result.isPrivate);
      ping(result.isPrivate ? 'Perfil privado ativado' : 'Perfil público ativado');
      await load();
    } catch (e) {
      ping(e.message);
    } finally {
      setPrivacyBusy(false);
    }
  };

  const markAll = async () => {
    try {
      await api.notifications.readAll();
      setItems(rows => rows.map(n => ({ ...n, read_at:n.read_at || new Date().toISOString() })));
      onUnreadChange?.(0);
    } catch (e) {
      ping(e.message);
    }
  };

  const unread = items.filter(n => !n.read_at).length;
  const pendingRequests = items.filter(n => n.type === 'follow_request' && n.follow_request_status === 'pending');

  if (person) return <>
    <ProfileView
      person={person}
      posts={posts}
      loadingPosts={loadingPosts}
      onBack={()=>{ setPerson(null); setPosts([]); }}
      onToggleFollow={toggleFollow}
    />
    <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} threads={threads}/>
    <Toast text={toast}/>
  </>;

  return <div className="lumina-facelift lumina-activity">
    <main className="activity-shell">
      <header className="activity-header">
        <div className="activity-header-row">
          <div className="activity-header-copy">
            <div className="activity-eyebrow">A tua rede agora</div>
            <h1>Atividade</h1>
            <div className="activity-header-summary">
              {unread ? `${unread} novidade${unread === 1 ? '' : 's'} por ver` : 'Tudo em dia.'}
            </div>
          </div>
          <div className="activity-header-actions">
            {unread > 0 && <button type="button" className="activity-read-all" onClick={markAll}>
              <Check size={14}/> Ler tudo
            </button>}
            <TopActions tab={tab} setTab={setTab} setThread={setThread} unreadCount={unreadCount}/>
          </div>
        </div>
      </header>

      <div className="activity-tabs" role="tablist" aria-label="Atividade">
        <button
          type="button"
          role="tab"
          aria-selected={section === 'alerts'}
          onClick={()=>setSection('alerts')}
          className={`activity-tab${section === 'alerts' ? ' is-active' : ''}`}
        >
          Alertas {pendingRequests.length > 0 && <span className="activity-tab-count">{pendingRequests.length}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'people'}
          onClick={()=>setSection('people')}
          className={`activity-tab${section === 'people' ? ' is-active' : ''}`}
        >
          Pessoas & privacidade
        </button>
      </div>

      {section === 'alerts' ? <>
        {loading && <div className="activity-loading"><span className="activity-loading-dot"/>A carregar atividade…</div>}

        {!loading && items.length === 0 && <div className="activity-empty">
          <span className="activity-empty-icon"><Bell size={24}/></span>
          <strong>Ainda não tens alertas.</strong>
          <p>Pedidos, mensagens, publicações e Salas vão aparecer aqui.</p>
        </div>}

        <div className="activity-list">
          {items.map(n => {
            const Icon = iconFor(n.type);
            const pending = n.type === 'follow_request' && n.follow_request_status === 'pending';
            return <article key={n.id} className={`activity-card${!n.read_at ? ' is-unread' : ''}`}>
              <button type="button" onClick={()=>openNotification(n)} aria-label="Abrir notificação" className="activity-icon-button">
                <Icon size={19}/>
              </button>
              <div className="activity-card-main">
                <button type="button" onClick={()=>openNotification(n)} className="activity-open-button">
                  <div className="activity-title">{notificationText(n)}</div>
                  <div className="activity-meta">
                    <span>{relativeTime(n.created_at)}</span>
                    <span className={`activity-read-state${!n.read_at ? ' is-unread' : ''}`}>{n.read_at ? 'Lida' : 'Não lida'}</span>
                  </div>
                </button>
                {pending && <div className="activity-request-actions">
                  <button type="button" className="activity-accept" onClick={()=>answerRequest(n, true)}>Aceitar</button>
                  <button type="button" className="activity-decline" onClick={()=>answerRequest(n, false)}>Recusar</button>
                </div>}
              </div>
              {!n.read_at && <span className="activity-unread-dot" aria-label="Não lida"/>}
            </article>;
          })}
        </div>
      </> : <>
        <section className={`activity-privacy-card${privacy ? '' : ' is-public'}`}>
          <div className="activity-privacy-top">
            <span className="activity-privacy-icon">{privacy ? <Lock size={18}/> : <Globe2 size={18}/>}</span>
            <div className="activity-privacy-copy">
              <strong>{privacy ? 'Perfil privado' : 'Perfil público'}</strong>
              <p>{privacy
                ? 'Só seguidores aceites veem as tuas publicações.'
                : 'Qualquer pessoa pode ver o teu perfil; o Feed mostra quem segues.'}</p>
            </div>
          </div>
          <button type="button" className="activity-privacy-toggle" disabled={privacyBusy} onClick={changePrivacy}>
            {privacyBusy ? 'A guardar…' : privacy ? 'Tornar público' : 'Tornar privado'}
          </button>
        </section>

        <label className="activity-search">
          <Search size={16}/>
          <input
            value={query}
            onChange={e=>setQuery(e.target.value)}
            placeholder="Pesquisar pessoas…"
            aria-label="Pesquisar pessoas"
          />
          {query && <button type="button" aria-label="Limpar pesquisa" onClick={()=>setQuery('')} className="activity-search-clear"><X size={15}/></button>}
        </label>

        {searching && <div className="activity-loading"><span className="activity-loading-dot"/>A pesquisar…</div>}

        <div className="activity-people-results">
          {results.map(p => <article key={p.id} className="activity-person-row">
            <button type="button" onClick={()=>openPerson(p.handle)} className="activity-person-open" aria-label={`Abrir perfil de ${p.name}`}>
              <span className="activity-avatar-halo"><Orb p={p.palette} avatarUrl={p.avatar_url} s={44}/></span>
            </button>
            <button type="button" onClick={()=>openPerson(p.handle)} className="activity-person-copy">
              <strong>{p.name}</strong>
              <span>@{p.handle} · {p.followers || 0} seguidores</span>
            </button>
            <button
              type="button"
              className={`activity-follow ${p.following || p.requested ? 'is-muted' : 'is-primary'}`}
              onClick={()=>toggleFollow(p)}
            >
              {p.following ? 'A seguir' : p.requested ? 'Pendente' : 'Seguir'}
            </button>
          </article>)}
        </div>
      </>}
    </main>

    <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} threads={threads}/>
    <Toast text={toast}/>
  </div>;
}
