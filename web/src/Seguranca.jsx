import React, { useState, useEffect } from 'react';
import { ArrowLeft, Shield, Smartphone, Check, X, Flag, Trash2, RotateCcw } from 'lucide-react';
import { api } from './api.js';
import { Orb, ErrorNote, Empty, Skeleton } from './ui.jsx';

/* ─────────────────────────── segurança da conta */

export function Seguranca({ onBack, ping }) {
  const [status, setStatus] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState(null);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(null);

  const load = () => {
    api.twoFactor.status().then(setStatus).catch(() => {});
    api.sessions.list().then(setSessions).catch(() => {});
  };
  useEffect(load, []);

  const start = async () => {
    setErr(null);
    try { setSetup(await api.twoFactor.setup()); }
    catch (e) { setErr(e); }
  };

  const enable = async () => {
    setErr(null);
    try {
      const out = await api.twoFactor.enable(code);
      setCodes(out.recoveryCodes);
      setSetup(null); setCode(''); load();
    } catch (e) { setErr(e); }
  };

  const disable = async () => {
    setErr(null);
    try { await api.twoFactor.disable(pw); setPw(''); load(); ping('Dois passos desligado'); }
    catch (e) { setErr(e); }
  };

  return (
    <div style={{ minHeight: '100dvh', paddingBottom: 100, background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
      <div style={{ maxWidth: 460, margin: '0 auto', padding: 20 }}>
        <button className="p" onClick={onBack} aria-label="Voltar" style={{ padding: 10, marginBottom: 22 }}><ArrowLeft size={16} /></button>
        <h2 className="d" style={{ fontSize: 38, marginBottom: 26 }}>Segu<span className="it">rança</span></h2>

        <ErrorNote error={err} />

        {/* ── dois passos ── */}
        <div className="card" style={{ padding: 20, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
            <Shield size={17} color={status?.enabled ? '#1E9E62' : 'var(--grey)'} />
            <span style={{ fontSize: 16, fontWeight: 600, flex: 1 }}>Dois passos</span>
            {status?.enabled && <span className="m" style={{ color: '#1E9E62' }}>Ativo</span>}
          </div>

          {codes ? (
            <>
              <p style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--grey)', marginBottom: 14 }}>
                Guarda estes códigos num sítio seguro. Cada um serve uma vez e é a
                única forma de entrares se perderes o telemóvel. <b>Não voltam a
                aparecer.</b>
              </p>
              <div style={{ background: '#F1EFFA', borderRadius: 14, padding: 14, fontFamily: 'DM Mono, monospace', fontSize: 13, lineHeight: 2 }}>
                {codes.map(c => <div key={c}>{c}</div>)}
              </div>
              <button className="p" style={{ marginTop: 14, width: '100%' }}
                onClick={() => { navigator.clipboard?.writeText(codes.join('\n')); ping('Copiados'); }}>
                Copiar
              </button>
              <button className="p p-ink" style={{ marginTop: 8, width: '100%' }} onClick={() => setCodes(null)}>
                Já os guardei
              </button>
            </>
          ) : setup ? (
            <>
              <p style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--grey)', marginBottom: 12 }}>
                Abre a tua app de autenticação e acrescenta este código:
              </p>
              <div style={{ background: '#F1EFFA', borderRadius: 14, padding: '14px 16px', fontFamily: 'DM Mono, monospace', fontSize: 15, letterSpacing: '.1em', wordBreak: 'break-all', marginBottom: 12 }}>
                {setup.secret}
              </div>
              <a href={setup.uri} className="p p-sm" style={{ display: 'inline-block', textDecoration: 'none', marginBottom: 14 }}>
                <Smartphone size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Abrir na app
              </a>
              <input inputMode="numeric" pattern="[0-9]*" maxLength={6} value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="Código de 6 dígitos" style={{ marginBottom: 10, letterSpacing: '.3em', textAlign: 'center' }} />
              <button className="p p-cr" onClick={enable} disabled={code.length !== 6} style={{ width: '100%', padding: 14 }}>
                Confirmar
              </button>
            </>
          ) : status?.enabled ? (
            <>
              <p style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--grey)', marginBottom: 12 }}>
                Restam-te {status.codesLeft} códigos de emergência.
              </p>
              <input type="password" value={pw} onChange={e => setPw(e.target.value)}
                placeholder="Password, para desligar" style={{ marginBottom: 10 }} />
              <button className="p" onClick={disable} disabled={!pw} style={{ width: '100%', color: 'var(--coral)' }}>
                Desligar dois passos
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--grey)', marginBottom: 14 }}>
                Com dois passos, saber a tua password deixa de chegar para entrar
                na tua conta.
              </p>
              <button className="p p-co" onClick={start} style={{ width: '100%', padding: 14 }}>Ligar</button>
            </>
          )}
        </div>

        {/* ── sessões ── */}
        <div className="card" style={{ padding: 20 }}>
          <div className="m" style={{ marginBottom: 12 }}>Onde tens sessão iniciada</div>
          {sessions.length === 0 ? <Skeleton h={40} /> : sessions.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: '1px solid #EFEDFA' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(s.user_agent || 'Dispositivo desconhecido').slice(0, 42)}
                </div>
                <div className="m" style={{ marginTop: 2 }}>
                  {s.current ? 'este dispositivo · ' : ''}{new Date(s.last_seen).toLocaleDateString('pt-PT')}
                </div>
              </div>
              {!s.current && (
                <button className="p p-sm" aria-label="Terminar esta sessão" onClick={async () => {
                  try { await api.sessions.revoke(s.id); setSessions(await api.sessions.list()); }
                  catch (e) { ping(e.message); }
                }}><Trash2 size={13} /></button>
              )}
            </div>
          ))}
          <button className="p" style={{ width: '100%', marginTop: 14, color: 'var(--coral)' }}
            onClick={async () => {
              if (!confirm('Fechar a sessão em todos os dispositivos?')) return;
              try { await api.sessions.revokeAll(); load(); ping('Todas as sessões fechadas'); }
              catch (e) { ping(e.message); }
            }}>
            <RotateCcw size={13} style={{ verticalAlign: -2, marginRight: 6 }} />Fechar tudo em todo o lado
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── fila de moderação */

export function Moderacao({ communities, onBack, ping }) {
  const mine = communities.filter(c => c.role === 'moderator' || c.role === 'founder');
  const [pick, setPick] = useState(mine[0]?.id || null);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async (cid) => {
    if (!cid) return setLoading(false);
    setLoading(true);
    try { setQueue(await api.moderation.queue(cid)); }
    catch { setQueue([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(pick); }, [pick]);

  const decide = async (id, resolution) => {
    try { await api.moderation.resolve(id, resolution); await load(pick); ping(`Marcado como ${resolution}`); }
    catch (e) { ping(e.message); }
  };

  if (!mine.length) return (
    <div style={{ minHeight: '100dvh', padding: 20, background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
      <button className="p" onClick={onBack} aria-label="Voltar" style={{ padding: 10, marginBottom: 22 }}><ArrowLeft size={16} /></button>
      <Empty>Não és moderador de nenhuma comunidade.</Empty>
    </div>
  );

  return (
    <div style={{ minHeight: '100dvh', paddingBottom: 100, background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: 20 }}>
        <button className="p" onClick={onBack} aria-label="Voltar" style={{ padding: 10, marginBottom: 22 }}><ArrowLeft size={16} /></button>
        <h2 className="d" style={{ fontSize: 38, marginBottom: 10 }}>Mode<span className="it">ração</span></h2>
        <p style={{ fontSize: 14.5, lineHeight: 1.45, color: 'var(--grey)', marginBottom: 20 }}>
          Conteúdo com três denúncias sai de vista automaticamente. Isso é uma
          pausa, não uma decisão — decidir é contigo.
        </p>

        {mine.length > 1 && (
          <div className="ns" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 18 }}>
            {mine.map(c => (
              <button key={c.id} className={pick === c.id ? 'p p-sm p-ink' : 'p p-sm'}
                onClick={() => setPick(c.id)} style={{ flexShrink: 0 }}>{c.name}</button>
            ))}
          </div>
        )}

        {loading ? <Skeleton h={90} /> : queue.length === 0 ? (
          <Empty>Nada por decidir. Bom sinal.</Empty>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {queue.map(r => (
              <div key={r.id} className="card in" style={{ padding: 17 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Flag size={14} color="var(--coral)" />
                  <span className="m" style={{ color: 'var(--coral)' }}>
                    {r.total} {r.total === 1 ? 'denúncia' : 'denúncias'} · {r.reason}
                  </span>
                  <span className="m" style={{ marginLeft: 'auto' }}>{r.target_type}</span>
                </div>
                <p style={{ fontSize: 15, lineHeight: 1.45, marginBottom: 8, color: '#332E4E' }}>
                  {r.content || <i style={{ color: 'var(--grey)' }}>conteúdo já removido</i>}
                </p>
                {r.note && <p style={{ fontSize: 13, color: 'var(--grey)', marginBottom: 12 }}>Nota: {r.note}</p>}
                <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
                  <button className="p p-sm" style={{ flex: 1 }} onClick={() => decide(r.id, 'mantido')}>
                    <Check size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Repor
                  </button>
                  <button className="p p-sm p-cr" style={{ flex: 1 }} onClick={() => decide(r.id, 'removido')}>
                    <X size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── páginas legais */

export function Legal({ page, onBack }) {
  const [text, setText] = useState(null);
  useEffect(() => {
    fetch(`/legal/${page}.md`).then(r => r.ok ? r.text() : null).then(setText).catch(() => setText(null));
  }, [page]);

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--paper)' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: 20 }}>
        <button className="p" onClick={onBack} aria-label="Voltar" style={{ padding: 10, marginBottom: 22 }}><ArrowLeft size={16} /></button>
        {text === null ? (
          <Empty>Não foi possível carregar. Escreve para o contacto de apoio.</Empty>
        ) : (
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 15, lineHeight: 1.6 }}>{text}</pre>
        )}
      </div>
    </div>
  );
}
