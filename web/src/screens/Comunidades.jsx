import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { api } from '../api.js';
import { Empty, Skeleton } from '../ui.jsx';

const SEEDS_NEEDED = 5;

/** Criar ou entrar numa comunidade. */
export function Comunidades({ mine, onJoined, onBack, ping }) {
  const [mode, setMode] = useState(mine.length ? 'descobrir' : 'criar');
  const [all, setAll] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const [name, setName] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState('');
  const [seeds, setSeeds] = useState(Array(SEEDS_NEEDED).fill(''));
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (mode === 'descobrir' && all === null) api.communities.list().then(setAll).catch(() => setAll([]));
  }, [mode]);

  const slugify = (s) => s.toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);

  const join = async (c) => {
    setBusyId(c.id);
    try { await api.communities.join(c.id); ping(`Entraste em ${c.name}`); onJoined(); }
    catch (e) { ping(e.message); }
    finally { setBusyId(null); }
  };

  const create = async () => {
    const cleanSeeds = seeds.map(s => s.trim()).filter(Boolean);
    if (name.trim().length < 2) return ping('Dá um nome à comunidade');
    if (name.trim().length > 60) return ping('O nome pode ter no máximo 60 caracteres');
    if ((slug || slugify(name)).length < 2) return ping('O identificador precisa de pelo menos 2 caracteres');
    if (cleanSeeds.length < SEEDS_NEEDED) return ping(`Escreve ${SEEDS_NEEDED} convites de arranque`);
    setCreating(true);
    try {
      const c = await api.communities.create({ slug: slug || slugify(name), name: name.trim(), seedProposals: cleanSeeds });
      ping(`${c.name} criada`);
      onJoined();
    } catch (e) { ping(e.message); }
    finally { setCreating(false); }
  };

  return (
    <div style={{ minHeight: '100dvh', paddingBottom: 40, background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
      <div style={{ maxWidth: 460, margin: '0 auto', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          {onBack && <button className="p" onClick={onBack} aria-label="Voltar" style={{ padding: 10 }}><ArrowLeft size={16} /></button>}
          <h2 className="d" style={{ fontSize: 24, flex: 1 }}>Comunidades</h2>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button className={mode === 'descobrir' ? 'p p-sm p-ink' : 'p p-sm'} onClick={() => setMode('descobrir')}>Descobrir</button>
          <button className={mode === 'criar' ? 'p p-sm p-ink' : 'p p-sm'} onClick={() => setMode('criar')}>Criar a minha</button>
        </div>

        {mode === 'descobrir' ? (
          <>
            {all === null && <Skeleton h={80} />}
            {all?.length === 0 && <Empty>Ainda não há nenhuma comunidade pública. Cria a primeira.</Empty>}
            <div style={{ display: 'grid', gap: 10 }}>
              {all?.filter(c => !mine.some(m => m.id === c.id)).map(c => (
                <div key={c.id} className="card in" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{c.name}</div>
                    <div className="m" style={{ marginTop: 3 }}>{c.member_count} membros</div>
                    {c.description && <p style={{ fontSize: 13, color: 'var(--grey)', marginTop: 6 }}>{c.description}</p>}
                  </div>
                  <button className="p p-brand p-sm" disabled={busyId === c.id} onClick={() => join(c)}>
                    {busyId === c.id ? '…' : 'Entrar'}
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="card" style={{ padding: 18 }}>
            <label className="m" style={{ display: 'block', marginBottom: 6 }}>Nome da comunidade</label>
            <input value={name} maxLength={60}
              onChange={e => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }}
              placeholder="ex: Amigos da faculdade" style={{ marginBottom: 14 }} />
            <label className="m" style={{ display: 'block', marginBottom: 6 }}>Identificador (usado no link)</label>
            <input value={slug} maxLength={32} onChange={e => { setSlug(slugify(e.target.value)); setSlugTouched(true); }}
              placeholder="amigos-da-faculdade" autoCapitalize="none" style={{ marginBottom: 18 }} />

            <label className="m" style={{ display: 'block', marginBottom: 8 }}>
              {SEEDS_NEEDED} convites de arranque — sem eles não há nada para propor no primeiro dia
            </label>
            <div style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
              {seeds.map((s, i) => (
                <input key={i} value={s} maxLength={120}
                  onChange={e => setSeeds(arr => arr.map((v, j) => j === i ? e.target.value : v))}
                  placeholder={`ideia ${i + 1}, ex: uma coisa que não acabaste`} />
              ))}
            </div>

            <button className="p p-brand" style={{ width: '100%', padding: 14 }} disabled={creating} onClick={create}>
              {creating ? 'A criar…' : 'Criar comunidade'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
