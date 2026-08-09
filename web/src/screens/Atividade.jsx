import React, { useEffect, useState } from 'react';
import {
  Bell, Check, DoorOpen, FileText, Globe2, Lock, Search, UserPlus, Users, X,
} from 'lucide-react';
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
  const days = Math.floor(hours / 24);
  return `há ${days} d`;
};

const iconFor = (type) => {
  if (type === 'new_post') return FileText;
  if (type === 'new_room' || type === 'room_invite') return DoorOpen;
  if (type === 'follow_request' || type === 'follow_accepted' || type === 'new_follower') return UserPlus;
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
  return 'Tens uma novidade';
}

function ProfileView({ person, posts, loadingPosts, onBack, onToggleFollow }) {
  if (!person) return null;
  const locked = person.is_private && !person.can_view_posts;
  return <div style={{ padding: 'calc(18px + env(safe-area-inset-top)) 18px 112px', maxWidth: 720, margin: '0 auto' }}>
    <button className="p" onClick={onBack} style={{ marginBottom: 18 }}>← Voltar</button>
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <Orb p={person.palette} avatarUrl={person.avatar_url} s={72} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="d" style={{ fontSize: 28, lineHeight: 1.05 }}>{person.name}</div>
          <div className="m" style={{ marginTop: 5 }}>@{person.handle}</div>
          <div className="m" style={{ marginTop: 5, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>{person.followers || 0} seguidores</span>
            <span>{person.following_count || 0} a seguir</span>
            <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
              {person.is_private ? <Lock size={12} /> : <Globe2 size={12} />}
              {person.is_private ? 'Privado' : 'Público'}
            </span>
          </div>
        </div>
      </div>
      {person.bio && <div style={{ marginTop: 15, lineHeight: 1.5 }}>{person.bio}</div>}
      <button className={person.following || person.requested ? 'p' : 'p p-brand'}
        onClick={() => onToggleFollow(person)} style={{ width: '100%', marginTop: 16 }}>
        {person.following ? 'A seguir' : person.requested ? 'Pedido enviado' : person.is_private ? 'Pedir para seguir' : 'Seguir'}
      </button>
    </div>

    <div style={{ marginTop: 18 }}>
      <div className="d" style={{ fontSize: 22, marginBottom: 10 }}>Publicações</div>
      {locked && <div className="card" style={{ padding: 28, textAlign: 'center' }}>
        <Lock size={28} style={{ marginBottom: 9 }} />
        <div style={{ fontWeight: 800 }}>Este perfil é privado.</div>
        <div className="m" style={{ marginTop: 6 }}>Quando o pedido for aceite, as publicações que podem ser partilhadas contigo ficam visíveis aqui.</div>
      </div>}
      {!locked && loadingPosts && <div className="m" style={{ padding: 22, textAlign: 'center' }}>A carregar publicações…</div>}
      {!locked && !loadingPosts && posts.length === 0 && <div className="card" style={{ padding: 24, textAlign: 'center' }}>
        <div style={{ fontWeight: 750 }}>Ainda não há publicações visíveis.</div>
        <div className="m" style={{ marginTop: 5 }}>As comunidades continuam a respeitar as suas próprias fronteiras de acesso.</div>
      </div>}
      {!locked && <div style={{ display: 'grid', gap: 12 }}>{posts.map(post => <div className="card" key={post.id} style={{ overflow: 'hidden' }}>
        {post.media_url && (post.media_mime || '').startsWith('video/')
          ? <video src={post.media_url} controls playsInline style={{ width: '100%', maxHeight: 420, display: 'block', background: '#0B0914' }} />
          : post.media_url ? <img src={post.media_url} alt="" style={{ width: '100%', maxHeight: 440, display: 'block', objectFit: 'cover' }} /> : null}
        <div style={{ padding: 16 }}>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{post.body}</div>
          <div className="m" style={{ marginTop: 9 }}>#{post.community_slug} · {post.likes || 0} gostos · {post.comments || 0} comentários</div>
        </div>
      </div>)}</div>}
    </div>
  </div>;
}

export function Atividade({
  tab, setTab, setThread, setComp, coms, threads, ping, toast, unreadCount = 0, onUnreadChange,
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
    } catch (e) { ping(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (section !== 'people') return;
    const term = query.trim();
    if (term.length < 2) { setResults([]); setSearching(false); return; }
    let active = true;
    setSearching(true);
    const timer = setTimeout(() => {
      api.users.search(term)
        .then(rows => { if (active) setResults(rows); })
        .catch(() => { if (active) setResults([]); })
        .finally(() => { if (active) setSearching(false); });
    }, 220);
    return () => { active = false; clearTimeout(timer); };
  }, [query, section]);

  const syncUnread = (rows) => onUnreadChange?.(rows.filter(n => !n.read_at).length);

  const markRead = async (notification) => {
    if (notification.read_at) return;
    try { await api.notifications.read(notification.id); } catch { return; }
    setItems(rows => {
      const next = rows.map(n => n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n);
      syncUnread(next);
      return next;
    });
  };

  const openPerson = async (handle) => {
    if (!handle) return;
    setLoadingPosts(true);
    try {
      const p = await api.users.get(handle);
      setPerson(p);
      if (p.can_view_posts) {
        const data = await api.users.posts(handle);
        setPosts(data.posts || []);
      } else setPosts([]);
    } catch (e) { ping(e.message); }
    finally { setLoadingPosts(false); }
  };

  const toggleFollow = async (target) => {
    try {
      let result;
      if (target.following || target.requested) result = await api.users.unfollow(target.id);
      else result = await api.users.followAction(target.id);
      const next = { ...target, following: !!result.following, requested: !!result.pending };
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
    } catch (e) { ping(e.message); }
  };

  const answerRequest = async (n, accept) => {
    try {
      if (accept) await api.users.acceptRequest(n.follow_request_id);
      else await api.users.declineRequest(n.follow_request_id);
      await api.notifications.read(n.id).catch(() => {});
      setItems(rows => {
        const next = rows.map(item => item.id === n.id
          ? { ...item, read_at: item.read_at || new Date().toISOString(), follow_request_status: accept ? 'accepted' : 'declined' }
          : item);
        syncUnread(next);
        return next;
      });
      ping(accept ? 'Pedido aceite' : 'Pedido recusado');
    } catch (e) { ping(e.message); }
  };

  const openNotification = async (n) => {
    await markRead(n);
    if (n.type === 'new_room' || n.type === 'room_invite') return setTab('rooms');
    if (n.actor_handle) return openPerson(n.actor_handle);
  };

  const changePrivacy = async () => {
    const next = !privacy;
    setPrivacyBusy(true);
    try {
      const result = await api.users.setPrivacy(next);
      setPrivacy(!!result.isPrivate);
      if (!result.isPrivate && result.acceptedPending > 0) {
        ping(`Perfil público. ${result.acceptedPending} pedido${result.acceptedPending === 1 ? '' : 's'} pendente${result.acceptedPending === 1 ? '' : 's'} aceite${result.acceptedPending === 1 ? '' : 's'}.`);
      } else ping(result.isPrivate ? 'Perfil privado ativado' : 'Perfil público ativado');
      await load();
    } catch (e) { ping(e.message); }
    finally { setPrivacyBusy(false); }
  };

  const markAll = async () => {
    try {
      await api.notifications.readAll();
      setItems(rows => rows.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
      onUnreadChange?.(0);
    } catch (e) { ping(e.message); }
  };

  const unread = items.filter(n => !n.read_at).length;
  const pendingRequests = items.filter(n => n.type === 'follow_request' && n.follow_request_status === 'pending');

  if (person) return <>
    <ProfileView person={person} posts={posts} loadingPosts={loadingPosts} onBack={() => { setPerson(null); setPosts([]); }} onToggleFollow={toggleFollow} />
    <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} coms={coms} threads={threads} ping={ping} unreadCount={unreadCount} />
    <Toast text={toast} />
  </>;

  return <div style={{ minHeight: '100dvh', paddingBottom: 102 }}>
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 'calc(20px + env(safe-area-inset-top)) 18px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <div className="d" style={{ fontSize: 34 }}>Atividade</div>
          <div className="m" style={{ marginTop: 4 }}>{unread ? `${unread} novidade${unread === 1 ? '' : 's'} por ver` : 'Tudo em dia.'}</div>
        </div>
        {unread > 0 && <button className="p p-sm" onClick={markAll}><Check size={14} />Ler tudo</button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, padding: 5, borderRadius: 18, background: '#E7E3F5', marginBottom: 16 }}>
        <button onClick={() => setSection('alerts')} style={{ border: 0, borderRadius: 14, padding: 11, fontWeight: 800, background: section === 'alerts' ? '#fff' : 'transparent', color: 'var(--ink)', boxShadow: section === 'alerts' ? '0 5px 16px rgba(30,20,75,.08)' : 'none' }}>Alertas {pendingRequests.length ? `· ${pendingRequests.length}` : ''}</button>
        <button onClick={() => setSection('people')} style={{ border: 0, borderRadius: 14, padding: 11, fontWeight: 800, background: section === 'people' ? '#fff' : 'transparent', color: 'var(--ink)', boxShadow: section === 'people' ? '0 5px 16px rgba(30,20,75,.08)' : 'none' }}>Pessoas & privacidade</button>
      </div>

      {section === 'alerts' ? <>
        {loading && <div className="m" style={{ padding: 25, textAlign: 'center' }}>A carregar atividade…</div>}
        {!loading && items.length === 0 && <div className="card" style={{ padding: 30, textAlign: 'center' }}><Bell size={28} style={{ marginBottom: 9 }} /><div style={{ fontWeight: 800 }}>Ainda não tens alertas.</div><div className="m" style={{ marginTop: 5 }}>Pedidos, publicações novas e Salas vão aparecer aqui.</div></div>}
        <div style={{ display: 'grid', gap: 9 }}>{items.map(n => {
          const I = iconFor(n.type);
          const pending = n.type === 'follow_request' && n.follow_request_status === 'pending';
          return <div key={n.id} className="card" style={{ padding: 13, display: 'flex', gap: 11, alignItems: 'flex-start', border: !n.read_at ? '1.5px solid rgba(77,62,255,.28)' : undefined, background: !n.read_at ? 'linear-gradient(135deg,#fff,#F3F0FF)' : undefined }}>
            <button onClick={() => openNotification(n)} aria-label="Abrir notificação" style={{ width: 45, height: 45, flexShrink: 0, border: 0, borderRadius: 16, background: '#17132F', color: '#fff', display: 'grid', placeItems: 'center' }}><I size={19} /></button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <button onClick={() => openNotification(n)} style={{ border: 0, background: 'transparent', padding: 0, textAlign: 'left', color: 'var(--ink)', width: '100%' }}>
                <div style={{ fontSize: 14.5, fontWeight: !n.read_at ? 800 : 650, lineHeight: 1.35 }}>{notificationText(n)}</div>
                {n.type === 'new_post' && n.post_body && <div className="m" style={{ marginTop: 4, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{n.post_body}</div>}
                {n.room_topic && <div className="m" style={{ marginTop: 4 }}>{n.room_topic}</div>}
                <div className="m" style={{ marginTop: 5 }}>{relativeTime(n.created_at)}</div>
              </button>
              {pending && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginTop: 10 }}>
                <button className="p p-sm p-brand" onClick={() => answerRequest(n, true)}><Check size={14} />Aceitar</button>
                <button className="p p-sm" onClick={() => answerRequest(n, false)}><X size={14} />Recusar</button>
              </div>}
              {(n.type === 'new_room' || n.type === 'room_invite') && <button className="p p-sm" onClick={() => openNotification(n)} style={{ marginTop: 9 }}><DoorOpen size={14} />Abrir Salas</button>}
            </div>
          </div>;
        })}</div>
      </> : <>
        <div className="card" style={{ padding: 17, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 46, height: 46, borderRadius: 16, display: 'grid', placeItems: 'center', background: privacy ? '#17132F' : '#EAE6FF', color: privacy ? '#fff' : '#4435D9' }}>{privacy ? <Lock size={19} /> : <Globe2 size={19} />}</div>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 850 }}>Perfil {privacy ? 'privado' : 'público'}</div><div className="m" style={{ marginTop: 4 }}>{privacy ? 'Novos seguidores precisam da tua aprovação.' : 'Quem tocar em Seguir começa a seguir-te de imediato.'}</div></div>
            <button className={privacy ? 'p p-sm' : 'p p-sm p-brand'} onClick={changePrivacy} disabled={privacyBusy}>{privacyBusy ? '…' : privacy ? 'Tornar público' : 'Tornar privado'}</button>
          </div>
        </div>

        <div className="card" style={{ padding: 15 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}><Users size={18} /><div style={{ fontWeight: 850 }}>Encontrar pessoas</div></div>
          <div style={{ position: 'relative' }}><Search size={17} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#958FB1' }} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nome ou @utilizador" autoCapitalize="none" style={{ paddingLeft: 42 }} /></div>
        </div>
        {searching && <div className="m" style={{ padding: 20, textAlign: 'center' }}>A procurar…</div>}
        <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>{!searching && results.map(r => <div key={r.id} className="card" style={{ padding: 12, display: 'flex', gap: 11, alignItems: 'center' }}>
          <button onClick={() => openPerson(r.handle)} style={{ padding: 0, border: 0, background: 'transparent' }}><Orb p={r.palette} avatarUrl={r.avatar_url} s={46} /></button>
          <button onClick={() => openPerson(r.handle)} style={{ minWidth: 0, flex: 1, padding: 0, border: 0, background: 'transparent', textAlign: 'left', color: 'var(--ink)' }}><div style={{ fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div><div className="m" style={{ marginTop: 2 }}>@{r.handle} · {r.is_private ? 'privado' : 'público'}</div></button>
          <button className={r.following || r.requested ? 'p p-sm' : 'p p-sm p-brand'} onClick={() => toggleFollow(r)}>{r.following ? 'A seguir' : r.requested ? 'Pendente' : 'Seguir'}</button>
        </div>)}</div>
      </>}
    </main>
    <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} coms={coms} threads={threads} ping={ping} unreadCount={unreadCount} />
    <Toast text={toast} />
  </div>;
}
