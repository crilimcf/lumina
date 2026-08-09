import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { api } from '../api.js';
import { Empty, Orb, Skeleton } from '../ui.jsx';

export function Amigos({ onBack, ping }) {
  const [q, setQ] = useState('');
  const [following, setFollowing] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.users.following().catch(() => []), api.users.suggestions().catch(() => [])])
      .then(([f, s]) => { setFollowing(f); setSuggestions(s); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); return; }
    let current = true;
    const t = setTimeout(() => {
      api.users.search(term).then(r => { if (current) setResults(r); }).catch(() => { if (current) setResults([]); });
    }, 300);
    return () => { current = false; clearTimeout(t); };
  }, [q]);

  const toggleFollow = async (person) => {
    try {
      const result = person.following || person.requested
        ? await api.users.unfollow(person.id)
        : await api.users.followAction(person.id);
      const next = { ...person, following: !!result.following, requested: !!result.pending };
      const patch = list => list.map(p => p.id === person.id ? next : p);
      setResults(r => r && patch(r));
      setSuggestions(s => result.following ? s.filter(p => p.id !== person.id) : patch(s));
      setFollowing(f => result.following ? [next, ...f.filter(p => p.id !== person.id)] : f.filter(p => p.id !== person.id));
      ping(result.pending ? 'Pedido enviado' : result.following ? `Agora segues ${person.name}` : `Deixaste de seguir ${person.name}`);
    } catch (e) { ping(e.message); }
  };

  const Row = ({ p }) => (
    <div className="card in" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
      <Orb p={p.palette} avatarUrl={p.avatar_url} s={42} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.02em' }}>{p.name}</div>
        <div className="m" style={{ marginTop: 2 }}>@{p.handle} · {p.followers} seguidores</div>
      </div>
      <button className={p.following || p.requested ? 'p p-sm' : 'p p-sm p-brand'} onClick={() => toggleFollow(p)}>
        {p.following ? 'A seguir' : p.requested ? 'Pendente' : 'Seguir'}
      </button>
    </div>
  );

  return (
    <div style={{ minHeight: '100dvh', paddingBottom: 40, background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
      <div style={{ maxWidth: 460, margin: '0 auto', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button className="p" onClick={onBack} aria-label="Voltar" style={{ padding: 10 }}><ArrowLeft size={16} /></button>
          <h2 className="d" style={{ fontSize: 24, flex: 1 }}>Pessoas</h2>
        </div>

        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar por nome ou utilizador…" style={{ marginBottom: 18 }} autoCapitalize="none" />
        {loading && <Skeleton h={80} />}

        {!loading && results !== null && <><div className="m" style={{ marginBottom: 10 }}>Resultados</div>{results.length === 0 && <Empty>Ninguém encontrado.</Empty>}<div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>{results.map(p => <Row key={p.id} p={p} />)}</div></>}

        {!loading && results === null && <>
          <div className="m" style={{ marginBottom: 10 }}>A seguir ({following.length})</div>
          {following.length === 0 && <Empty>Ainda não segues ninguém.</Empty>}
          <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>{following.map(p => <Row key={p.id} p={p} />)}</div>
          <div className="m" style={{ marginBottom: 10 }}>Pessoas que talvez conheças</div>
          {suggestions.length === 0 ? <Empty>Sem sugestões por agora — pesquisa por nome ou utilizador acima.</Empty> : <div style={{ display: 'grid', gap: 10 }}>{suggestions.map(p => <Row key={p.id} p={p} />)}</div>}
        </>}
      </div>
    </div>
  );
}
