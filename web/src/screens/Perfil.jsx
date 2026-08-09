import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight, Flag, Search, Shield, Sparkles, UserPlus, Users, X,
} from 'lucide-react';
import { api } from '../api.js';
import { Orb } from '../ui.jsx';
import { Nav, Toast } from '../components/AppChrome.jsx';

function roleLabel(role) {
  if (role === 'founder') return 'Fundador';
  if (role === 'moderator') return 'Moderador';
  return 'Membro';
}

function DiscoverySheet({
  open, onClose, initialTab, followers, setFollowers, following, setFollowing, suggestions, setSuggestions,
  publicCommunities, coms, setComs, onOpenCommunity, ping,
}) {
  const [tab, setTab] = useState(initialTab || 'people');
  const [query, setQuery] = useState('');
  const [peopleResults, setPeopleResults] = useState(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab || 'people');
    setQuery('');
    setPeopleResults(null);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open || tab !== 'people') return;
    const term = query.trim();
    if (term.length < 2) { setPeopleResults(null); setSearching(false); return; }
    let active = true;
    setSearching(true);
    const timer = setTimeout(() => {
      api.users.search(term)
        .then(rows => { if (active) setPeopleResults(rows); })
        .catch(() => { if (active) setPeopleResults([]); })
        .finally(() => { if (active) setSearching(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [open, tab, query]);

  const toggleFollow = async (person) => {
    try {
      if (person.following) await api.users.unfollow(person.id);
      else await api.users.follow(person.id);
      const nowFollowing = !person.following;
      const next = { ...person, following: nowFollowing };
      setPeopleResults(rows => rows && rows.map(p => p.id === person.id ? next : p));
      setFollowers(rows => rows.map(p => p.id === person.id ? { ...p, following: nowFollowing } : p));
      setFollowing(rows => nowFollowing
        ? [next, ...rows.filter(p => p.id !== person.id)]
        : rows.filter(p => p.id !== person.id));
      setSuggestions(rows => nowFollowing
        ? rows.filter(p => p.id !== person.id)
        : [next, ...rows.filter(p => p.id !== person.id)]);
      ping(nowFollowing ? `Agora segues ${person.name}` : `Deixaste de seguir ${person.name}`);
    } catch (e) { ping(e.message); }
  };

  const joinCommunity = async (community) => {
    try {
      await api.communities.join(community.id);
      const mine = await api.communities.mine();
      setComs(mine);
      ping(`Entraste em ${community.name}`);
    } catch (e) { ping(e.message); }
  };

  const visibleCommunities = useMemo(() => {
    const term = query.trim().toLowerCase();
    const rows = publicCommunities || [];
    if (!term) return rows;
    return rows.filter(c => `${c.name} ${c.slug} ${c.description || ''}`.toLowerCase().includes(term));
  }, [publicCommunities, query]);

  if (!open) return null;

  const people = peopleResults ?? (suggestions.length ? suggestions : following);

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 85, background: 'rgba(16,12,38,.48)',
      backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} className="in" style={{
        width: '100%', maxWidth: 520, maxHeight: '88dvh', overflow: 'hidden',
        background: 'linear-gradient(180deg,#F7F6FD,#ECE9FA)', borderRadius: '30px 30px 0 0',
        boxShadow: '0 -18px 60px rgba(20,18,42,.22)',
      }}>
        <div style={{ padding: '18px 18px 12px', position: 'sticky', top: 0, zIndex: 3, background: 'rgba(247,246,253,.94)', backdropFilter: 'blur(14px)' }}>
          <div style={{ width: 42, height: 5, borderRadius: 9, background: '#D7D2EA', margin: '0 auto 15px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <div className="d" style={{ fontSize: 27 }}>Descobrir</div>
              <div className="m" style={{ marginTop: 3 }}>Pessoas e círculos sem saíres do teu perfil.</div>
            </div>
            <button className="p" aria-label="Fechar descobrir" onClick={onClose} style={{ padding: 10 }}><X size={16} /></button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: 4, background: '#E7E3F5', borderRadius: 16, marginBottom: 12 }}>
            {[['people', 'Pessoas'], ['communities', 'Comunidades']].map(([key, label]) => (
              <button key={key} onClick={() => { setTab(key); setQuery(''); setPeopleResults(null); }}
                style={{ border: 0, borderRadius: 13, padding: '10px 12px', cursor: 'pointer', fontWeight: 700,
                  color: tab === key ? 'var(--ink)' : 'var(--grey)',
                  background: tab === key ? '#fff' : 'transparent',
                  boxShadow: tab === key ? '0 5px 16px rgba(30,20,75,.09)' : 'none' }}>
                {label}
              </button>
            ))}
          </div>

          <div style={{ position: 'relative' }}>
            <Search size={17} style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)', color: '#9A94B7' }} />
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder={tab === 'people' ? 'Pesquisar pessoas…' : 'Pesquisar comunidades…'}
              style={{ paddingLeft: 43, background: '#fff' }} autoCapitalize="none" />
          </div>
        </div>

        <div className="ns" style={{ overflowY: 'auto', maxHeight: 'calc(88dvh - 210px)', padding: '6px 18px calc(26px + env(safe-area-inset-bottom))' }}>
          {tab === 'people' ? (
            <>
              <div className="m" style={{ margin: '5px 0 10px' }}>
                {peopleResults !== null ? 'Resultados' : suggestions.length ? 'Pessoas que podes conhecer' : 'A tua órbita'}
              </div>
              {searching && <div className="m" style={{ padding: 18, textAlign: 'center' }}>A procurar…</div>}
              {!searching && people.length === 0 && (
                <div className="card" style={{ padding: 20, textAlign: 'center' }}>
                  <Sparkles size={20} style={{ marginBottom: 8 }} />
                  <div style={{ fontWeight: 700 }}>Ainda não encontrámos ninguém.</div>
                  <div className="m" style={{ marginTop: 5 }}>Experimenta outro nome ou entra em mais comunidades.</div>
                </div>
              )}
              <div style={{ display: 'grid', gap: 9 }}>
                {!searching && people.map(person => (
                  <div key={person.id} className="card" style={{ padding: 13, display: 'flex', alignItems: 'center', gap: 11 }}>
                    <Orb p={person.palette} avatarUrl={person.avatar_url} s={45} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{person.name}</div>
                      <div className="m" style={{ marginTop: 2 }}>@{person.handle} · {person.followers || 0} seguidores</div>
                    </div>
                    <button className={person.following ? 'p p-sm' : 'p p-sm p-brand'} onClick={() => toggleFollow(person)}>
                      {person.following ? 'A seguir' : 'Seguir'}
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="m" style={{ margin: '5px 0 10px' }}>Círculos para descobrir</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {visibleCommunities.map(community => {
                  const mine = coms.find(c => c.id === community.id);
                  return (
                    <div key={community.id} className="card" style={{ padding: 16 }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ width: 44, height: 44, borderRadius: 16, display: 'grid', placeItems: 'center', flexShrink: 0,
                          background: '#17132F', color: '#fff', fontWeight: 800, fontSize: 18 }}>
                          {community.name?.trim()?.[0]?.toUpperCase() || 'L'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 15 }}>{community.name}</div>
                          <div className="m" style={{ marginTop: 3 }}>{community.member_count || 0} membros · #{community.slug}</div>
                          {community.description && <div style={{ fontSize: 13.5, lineHeight: 1.4, color: 'var(--grey)', marginTop: 8 }}>{community.description}</div>}
                        </div>
                      </div>
                      <button className={mine ? 'p' : 'p p-ink'} style={{ width: '100%', marginTop: 13 }}
                        onClick={() => mine ? (onClose(), onOpenCommunity(community.id)) : joinCommunity(community)}>
                        {mine ? 'Abrir círculo' : 'Entrar neste círculo'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ConnectionsSheet({
  open, onClose, initialTab, followers, setFollowers, following, setFollowing, suggestions, setSuggestions, ping,
}) {
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
      const nowFollowing = !person.following;
      if (nowFollowing) await api.users.follow(person.id);
      else await api.users.unfollow(person.id);

      const next = { ...person, following: nowFollowing };
      setFollowers(rows => rows.map(p => p.id === person.id ? { ...p, following: nowFollowing } : p));
      setFollowing(rows => nowFollowing
        ? [next, ...rows.filter(p => p.id !== person.id)]
        : rows.filter(p => p.id !== person.id));
      setSuggestions(rows => nowFollowing
        ? rows.filter(p => p.id !== person.id)
        : [next, ...rows.filter(p => p.id !== person.id)]);
      ping(nowFollowing ? `Agora segues ${person.name}` : `Deixaste de seguir ${person.name}`);
    } catch (e) { ping(e.message); }
  };

  if (!open) return null;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 87, background: 'rgba(16,12,38,.5)',
      backdropFilter: 'blur(9px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} className="in" style={{
        width: '100%', maxWidth: 520, maxHeight: '86dvh', overflow: 'hidden',
        background: 'linear-gradient(180deg,#F8F7FE,#ECE9FA)', borderRadius: '30px 30px 0 0',
        boxShadow: '0 -20px 64px rgba(20,18,42,.24)',
      }}>
        <div style={{ padding: '18px 18px 12px', background: 'rgba(248,247,254,.95)', backdropFilter: 'blur(16px)' }}>
          <div style={{ width: 42, height: 5, borderRadius: 9, background: '#D7D2EA', margin: '0 auto 15px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <div className="d" style={{ fontSize: 27 }}>Ligações</div>
              <div className="m" style={{ marginTop: 3 }}>A tua rede, sem saíres do perfil.</div>
            </div>
            <button className="p" aria-label="Fechar ligações" onClick={onClose} style={{ padding: 10 }}><X size={16} /></button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: 4, background: '#E7E3F5', borderRadius: 16, marginBottom: 12 }}>
            <button onClick={() => { setTab('followers'); setQuery(''); }}
              style={{ border: 0, borderRadius: 13, padding: '10px 12px', cursor: 'pointer', fontWeight: 750,
                color: tab === 'followers' ? 'var(--ink)' : 'var(--grey)', background: tab === 'followers' ? '#fff' : 'transparent',
                boxShadow: tab === 'followers' ? '0 5px 16px rgba(30,20,75,.09)' : 'none' }}>
              Seguidores · {followers.length}
            </button>
            <button onClick={() => { setTab('following'); setQuery(''); }}
              style={{ border: 0, borderRadius: 13, padding: '10px 12px', cursor: 'pointer', fontWeight: 750,
                color: tab === 'following' ? 'var(--ink)' : 'var(--grey)', background: tab === 'following' ? '#fff' : 'transparent',
                boxShadow: tab === 'following' ? '0 5px 16px rgba(30,20,75,.09)' : 'none' }}>
              A seguir · {following.length}
            </button>
          </div>

          <div style={{ position: 'relative' }}>
            <Search size={17} style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)', color: '#9A94B7' }} />
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder={tab === 'followers' ? 'Pesquisar seguidores…' : 'Pesquisar quem segues…'}
              style={{ paddingLeft: 43, background: '#fff' }} autoCapitalize="none" />
          </div>
        </div>

        <div className="ns" style={{ overflowY: 'auto', maxHeight: 'calc(86dvh - 190px)', padding: '8px 18px calc(26px + env(safe-area-inset-bottom))' }}>
          {visible.length === 0 ? (
            <div style={{ padding: '32px 14px', textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: 20, display: 'grid', placeItems: 'center', margin: '0 auto 12px', background: '#E9E5F8' }}>
                <Users size={21} />
              </div>
              <div style={{ fontWeight: 800 }}>{query ? 'Nenhuma ligação encontrada.' : tab === 'followers' ? 'Ainda sem seguidores.' : 'Ainda não segues ninguém.'}</div>
              <div className="m" style={{ marginTop: 6 }}>{query ? 'Experimenta outro nome.' : 'À medida que a tua rede cresce, as pessoas aparecem aqui.'}</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 9 }}>
              {visible.map(person => {
                const mutual = person.following && person.follows_me;
                return (
                  <div key={person.id} className="card" style={{ padding: 13, display: 'flex', alignItems: 'center', gap: 11 }}>
                    <Orb p={person.palette} avatarUrl={person.avatar_url} s={47} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 780, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{person.name}</div>
                      <div className="m" style={{ marginTop: 2 }}>@{person.handle}</div>
                      <div style={{ marginTop: 6, display: 'inline-flex', borderRadius: 999, padding: '4px 7px', fontSize: 9.5, fontWeight: 750,
                        background: mutual ? '#EEE9FF' : '#F2F0F8', color: mutual ? '#654FDB' : 'var(--grey)' }}>
                        {mutual ? 'Ligação mútua' : tab === 'followers' ? 'Segue-te' : person.follows_me ? 'Segue-te também' : 'Na tua órbita'}
                      </div>
                    </div>
                    <button className={person.following ? 'p p-sm' : 'p p-sm p-brand'} onClick={() => toggleFollow(person)}>
                      {person.following ? 'A seguir' : person.follows_me ? 'Seguir de volta' : 'Seguir'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Perfil({
  me, coms, setComs, days, blocked, setBlocked, setScreen, logout,
  tab, setTab, setThread, setComp, threads, ping, toast, onOpenCommunity,
}) {
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [publicCommunities, setPublicCommunities] = useState([]);
  const [socialLoading, setSocialLoading] = useState(true);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [discoveryTab, setDiscoveryTab] = useState('people');
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [connectionsTab, setConnectionsTab] = useState('followers');

  useEffect(() => {
    let active = true;
    Promise.all([
      api.users.followers().catch(() => []),
      api.users.following().catch(() => []),
      api.users.suggestions().catch(() => []),
      api.communities.list().catch(() => []),
    ]).then(([peopleFollowingMe, people, suggested, communities]) => {
      if (!active) return;
      setFollowers(peopleFollowingMe);
      setFollowing(people);
      setSuggestions(suggested);
      setPublicCommunities(communities);
    }).finally(() => { if (active) setSocialLoading(false); });
    return () => { active = false; };
  }, []);

  const openDiscovery = (nextTab) => {
    setDiscoveryTab(nextTab);
    setDiscoveryOpen(true);
  };

  const openConnections = (nextTab) => {
    setConnectionsTab(nextTab);
    setConnectionsOpen(true);
  };

  const answeredDays = days.filter(d => d.answered).length;
  const followerCount = socialLoading ? (me.followers || 0) : followers.length;

  const metricStyle = {
    background: 'rgba(255,255,255,.66)', border: '1px solid rgba(255,255,255,.8)', borderRadius: 18,
    padding: '13px 10px', textAlign: 'center', backdropFilter: 'blur(12px)', boxShadow: '0 8px 22px rgba(35,24,80,.08)',
  };

  return (
    <div style={{ minHeight: '100dvh', paddingBottom: 105, background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
      <div style={{ maxWidth: 460, margin: '0 auto', padding: '18px 16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '2px 2px 0' }}>
          <Orb p={me.palette} avatarUrl={me.avatar_url} s={84} cls="float" />
          <button className="p" onClick={() => setScreen('editar-perfil')} style={{ marginTop: 4 }}>Editar perfil</button>
        </div>
        <h2 className="d" style={{ fontSize: 39, margin: '24px 2px 7px', letterSpacing: '-.045em' }}>{me.name}</h2>
        <div className="m" style={{ marginLeft: 2 }}>@{me.handle}</div>
        <p style={{ fontSize: 16, lineHeight: 1.48, color: 'var(--grey)', margin: '14px 2px 20px' }}>{me.bio || 'Sem descrição.'}</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
          <button aria-label="Ver seguidores" onClick={() => openConnections('followers')}
            style={{ ...metricStyle, border: '1px solid rgba(255,255,255,.9)', cursor: 'pointer', color: 'var(--ink)' }}>
            <div className="d" style={{ fontSize: 23 }}>{followerCount}</div>
            <div className="m" style={{ marginTop: 4, fontSize: 9.5 }}>Seguidores <ArrowUpRight size={10} style={{ verticalAlign: -1 }} /></div>
          </button>
          <button aria-label="Ver a seguir" onClick={() => openConnections('following')}
            style={{ ...metricStyle, border: '1px solid rgba(255,255,255,.9)', cursor: 'pointer', color: 'var(--ink)' }}>
            <div className="d" style={{ fontSize: 23 }}>{following.length}</div>
            <div className="m" style={{ marginTop: 4, fontSize: 9.5 }}>A seguir <ArrowUpRight size={10} style={{ verticalAlign: -1 }} /></div>
          </button>
          <div style={metricStyle}>
            <div className="d" style={{ fontSize: 23 }}>{answeredDays}</div>
            <div className="m" style={{ marginTop: 4, fontSize: 9.5 }}>Dias</div>
          </div>
        </div>

        <section style={{
          position: 'relative', overflow: 'hidden', borderRadius: 28, padding: 19, marginBottom: 14,
          background: 'linear-gradient(135deg,#17132F 0%,#25204B 58%,#332968 100%)', color: '#fff',
          boxShadow: '0 18px 42px -16px rgba(24,18,65,.55)',
        }}>
          <div style={{ position: 'absolute', width: 180, height: 180, borderRadius: 999, right: -80, top: -90, background: 'rgba(177,157,255,.18)', filter: 'blur(2px)' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div className="m" style={{ color: 'rgba(255,255,255,.55)', marginBottom: 5 }}>A TUA ÓRBITA</div>
                <div className="d" style={{ color: '#fff', fontSize: 25 }}>As pessoas à tua volta</div>
              </div>
              <button onClick={() => openDiscovery('people')} style={{ border: 0, cursor: 'pointer', borderRadius: 999, padding: '9px 12px', background: 'rgba(255,255,255,.12)', color: '#fff', fontWeight: 700, fontSize: 12 }}>
                <UserPlus size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Descobrir
              </button>
            </div>

            <div className="ns" style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', gap: 10, marginTop: 18, paddingBottom: 2 }}>
              {socialLoading && <div className="m" style={{ color: 'rgba(255,255,255,.55)', padding: '10px 0' }}>A ligar a tua órbita…</div>}
              {!socialLoading && following.length === 0 && (
                <button onClick={() => openDiscovery('people')} style={{ width: '100%', border: '1px dashed rgba(255,255,255,.25)', borderRadius: 19, padding: 16, textAlign: 'left', cursor: 'pointer', color: '#fff', background: 'rgba(255,255,255,.06)' }}>
                  <div style={{ fontWeight: 750 }}>A tua órbita começa aqui.</div>
                  <div style={{ fontSize: 12.5, opacity: .6, marginTop: 5 }}>Encontra pessoas das tuas comunidades e segue quem te interessa.</div>
                </button>
              )}
              {!socialLoading && following.slice(0, 8).map(person => (
                <button key={person.id} onClick={() => openConnections('following')}
                  style={{ minWidth: 72, maxWidth: 72, background: 'none', border: 0, color: '#fff', padding: 0, cursor: 'pointer', textAlign: 'center' }}>
                  <div style={{ width: 56, height: 56, borderRadius: 999, padding: 2, margin: '0 auto 7px', background: 'linear-gradient(135deg,#FF735F,#8B72FF)' }}>
                    <div style={{ borderRadius: 999, padding: 2, background: '#1C1838', width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
                      <Orb p={person.palette} avatarUrl={person.avatar_url} s={48} />
                    </div>
                  </div>
                  <div style={{ fontSize: 11.5, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{person.name?.split(' ')[0]}</div>
                </button>
              ))}
              {!socialLoading && following.length > 0 && (
                <button onClick={() => openDiscovery('people')}
                  style={{ minWidth: 56, height: 56, borderRadius: 999, border: '1px dashed rgba(255,255,255,.3)', background: 'rgba(255,255,255,.06)', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                  <UserPlus size={18} />
                </button>
              )}
            </div>
          </div>
        </section>

        <section style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'end', gap: 10, padding: '3px 2px 10px' }}>
            <div style={{ flex: 1 }}>
              <div className="m">OS TEUS CÍRCULOS</div>
              <div className="d" style={{ fontSize: 23, marginTop: 3 }}>Onde as coisas acontecem</div>
            </div>
            <button onClick={() => openDiscovery('communities')} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--cobalt)', fontWeight: 750, fontSize: 12 }}>
              Explorar <ArrowUpRight size={13} style={{ verticalAlign: -2 }} />
            </button>
          </div>

          <div className="ns" style={{ display: 'flex', overflowX: 'auto', gap: 10, padding: '2px 2px 8px', margin: '0 -2px' }}>
            {coms.length === 0 && (
              <button onClick={() => openDiscovery('communities')} className="card" style={{ minWidth: '100%', border: '1px dashed #CFC8E8', padding: 18, textAlign: 'left', cursor: 'pointer' }}>
                <Users size={19} />
                <div style={{ fontWeight: 800, marginTop: 10 }}>Encontra o teu primeiro círculo</div>
                <div className="m" style={{ marginTop: 5 }}>Comunidades dão vida ao feed, convites e novas ligações.</div>
              </button>
            )}
            {coms.map(community => (
              <button key={community.id} onClick={() => onOpenCommunity(community.id)} className="card"
                style={{ minWidth: 218, width: 218, border: 0, padding: 17, textAlign: 'left', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
                <div style={{ width: 40, height: 40, borderRadius: 15, display: 'grid', placeItems: 'center', background: '#17132F', color: '#fff', fontWeight: 850, fontSize: 17 }}>
                  {community.name?.trim()?.[0]?.toUpperCase() || 'L'}
                </div>
                <div style={{ fontWeight: 850, fontSize: 15.5, marginTop: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{community.name}</div>
                <div className="m" style={{ marginTop: 4 }}>{community.member_count || 0} membros · {roleLabel(community.role)}</div>
                <div style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '7px 9px', fontSize: 10.5, fontWeight: 750,
                  background: community.invite_id && !community.answered ? '#FFF0EB' : '#F0EEF8',
                  color: community.invite_id && !community.answered ? '#D9513D' : 'var(--grey)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: 'currentColor' }} />
                  {community.invite_id ? (community.answered ? 'Respondido hoje' : 'Convite por responder') : 'A acompanhar'}
                </div>
              </button>
            ))}
          </div>
        </section>

        <div className="card" style={{ padding: 18, marginBottom: 12 }}>
          <div className="m" style={{ marginBottom: 8 }}>Os teus dados</div>
          <button className="p p-sm" style={{ marginRight: 8 }}
            onClick={async () => { try { await api.account.download(); ping('Descarregado'); } catch (e) { ping(e.message); } }}>
            Descarregar tudo
          </button>
          <button className="p p-sm" style={{ color: 'var(--coral)' }}
            onClick={async () => {
              if (!confirm('Apagar a conta? Tens 30 dias para mudar de ideias.')) return;
              try { const r = await api.account.remove(); ping(r.message); } catch (e) { ping(e.message); }
            }}>Apagar conta</button>
          <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--grey)', marginTop: 12 }}>
            Podes levar os teus dados contigo a qualquer momento. O apagamento tem 30 dias
            de espera — entra outra vez até lá para cancelar.
          </p>
        </div>

        <button className="card" onClick={() => setScreen('seguranca')}
          style={{ width: '100%', border: 0, cursor: 'pointer', padding: 18, textAlign: 'left', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Shield size={17} color="var(--grey)" />
          <span style={{ flex: 1, fontSize: 15, fontWeight: 650 }}>Segurança da conta</span>
          <ArrowUpRight size={17} color="#ADA6CC" />
        </button>

        {coms.some(c => c.role === 'moderator' || c.role === 'founder') && (
          <button className="card" onClick={() => setScreen('moderacao')}
            style={{ width: '100%', border: 0, cursor: 'pointer', padding: 18, textAlign: 'left', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Flag size={17} color="var(--grey)" />
            <span style={{ flex: 1, fontSize: 15, fontWeight: 650 }}>Moderação</span>
            <ArrowUpRight size={17} color="#ADA6CC" />
          </button>
        )}

        <div className="card" style={{ padding: 18, marginBottom: 12 }}>
          <div className="m" style={{ marginBottom: 10 }}>Pessoas bloqueadas</div>
          {blocked.length === 0
            ? <p style={{ fontSize: 14, color: 'var(--grey)' }}>Ninguém bloqueado.</p>
            : blocked.map(person => (
              <div key={person.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 0' }}>
                <Orb p={person.palette} s={30} />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{person.name}</span>
                <button className="p p-sm" onClick={async () => {
                  try { await api.users.unblock(person.id); setBlocked(await api.users.blocked()); ping('Desbloqueado'); }
                  catch (e) { ping(e.message); }
                }}>Desbloquear</button>
              </div>
            ))}
        </div>

        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', margin: '20px 0' }}>
          <button className="m" style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={() => setScreen('TERMOS')}>Termos</button>
          <button className="m" style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={() => setScreen('PRIVACIDADE')}>Privacidade</button>
        </div>

        <button className="p" onClick={logout} style={{ width: '100%', color: 'var(--coral)' }}>Sair</button>
      </div>

      <DiscoverySheet
        open={discoveryOpen} onClose={() => setDiscoveryOpen(false)} initialTab={discoveryTab}
        followers={followers} setFollowers={setFollowers}
        following={following} setFollowing={setFollowing} suggestions={suggestions} setSuggestions={setSuggestions}
        publicCommunities={publicCommunities} coms={coms} setComs={setComs}
        onOpenCommunity={onOpenCommunity} ping={ping}
      />
      <ConnectionsSheet
        open={connectionsOpen} onClose={() => setConnectionsOpen(false)} initialTab={connectionsTab}
        followers={followers} setFollowers={setFollowers} following={following} setFollowing={setFollowing}
        suggestions={suggestions} setSuggestions={setSuggestions} ping={ping}
      />
      <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} coms={coms} threads={threads} ping={ping} />
      <Toast text={toast} />
    </div>
  );
}
