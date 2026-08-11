import React, { useEffect, useState } from 'react';
import { ArrowLeft, Search, Sparkles, X } from 'lucide-react';
import { api } from '../api.js';
import { Orb } from '../ui.jsx';
import '../search-facelift.css';

export function Amigos({ onBack, ping, onOpenProfile }) {
  const [q, setQ] = useState('');
  const [following, setFollowing] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    Promise.all([api.users.following().catch(() => []), api.users.suggestions().catch(() => [])])
      .then(([f, s]) => { setFollowing(f); setSuggestions(s); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); setSearching(false); return; }
    let current = true;
    setSearching(true);
    const t = setTimeout(() => {
      api.users.search(term)
        .then(r => { if (current) setResults(r); })
        .catch(() => { if (current) setResults([]); })
        .finally(() => { if (current) setSearching(false); });
    }, 260);
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
    <article className="search-person in">
      <button type="button" className="search-person-open" onClick={() => onOpenProfile?.(p)} aria-label={`Abrir perfil de ${p.name}`}>
        <Orb p={p.palette} avatarUrl={p.avatar_url} s={44} />
      </button>
      <button type="button" className="search-person-copy" onClick={() => onOpenProfile?.(p)}>
        <strong>{p.name}</strong>
        <span>@{p.handle} · {p.followers || 0} seguidores</span>
      </button>
      <button className={`search-follow${p.following || p.requested ? '' : ' is-primary'}`} onClick={() => toggleFollow(p)}>
        {p.following ? 'A seguir' : p.requested ? 'Pendente' : 'Seguir'}
      </button>
    </article>
  );

  const State = ({ title, children }) => <div className="search-state"><Sparkles size={22}/><strong>{title}</strong><span>{children}</span></div>;

  return <div className="lumina-search-screen">
    <main className="search-shell">
      <header className="search-header">
        <button className="search-back" onClick={onBack} aria-label="Voltar"><ArrowLeft size={18}/></button>
        <div>
          <div className="search-eyebrow">Encontra a tua rede</div>
          <h1 className="search-title">Pesquisar</h1>
        </div>
      </header>

      <div className="search-field-wrap">
        <label className="search-field">
          <Search size={18}/>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Nome ou @utilizador"
            aria-label="Pesquisar por nome ou utilizador"
            autoCapitalize="none"
            autoCorrect="off"
            autoFocus
          />
          {q ? <button type="button" className="search-clear" onClick={() => setQ('')} aria-label="Limpar pesquisa"><X size={17}/></button> : <span/>}
        </label>
      </div>

      {loading && <div className="search-loading"><span className="search-loading-dot"/>A preparar pessoas…</div>}
      {!loading && searching && <div className="search-loading"><span className="search-loading-dot"/>A pesquisar…</div>}

      {!loading && results !== null && !searching && <section className="search-section">
        <div className="search-section-head"><strong>Resultados</strong><span>{results.length}</span></div>
        {results.length === 0
          ? <State title="Ninguém encontrado">Experimenta outro nome ou @utilizador.</State>
          : <div className="search-list">{results.map(p => <Row key={p.id} p={p}/>)}</div>}
      </section>}

      {!loading && results === null && <>
        <section className="search-section">
          <div className="search-section-head"><strong>A tua rede</strong><span>{following.length} a seguir</span></div>
          {following.length === 0
            ? <State title="A tua rede começa aqui">Pesquisa pessoas ou escolhe uma sugestão abaixo.</State>
            : <div className="search-list">{following.map(p => <Row key={p.id} p={p}/>)}</div>}
        </section>

        <section className="search-section">
          <div className="search-section-head"><strong>Pessoas para descobrir</strong><span>Sugestões</span></div>
          {suggestions.length === 0
            ? <State title="Sem sugestões por agora">Escreve um nome na pesquisa para encontrar alguém.</State>
            : <div className="search-list">{suggestions.map(p => <Row key={p.id} p={p}/>)}</div>}
        </section>
      </>}
    </main>
  </div>;
}
