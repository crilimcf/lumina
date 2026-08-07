import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, X, ArrowLeft, ArrowUpRight, Send, Timer, Eye, MessageSquare, Camera, Repeat2, Sparkles, Home, User, ArrowUp, Image, Flag, Loader2, Shield } from 'lucide-react';
import { api, token, ApiError } from './api.js';
import { PAL, Orb, Skeleton, ErrorNote, Empty } from './ui.jsx';
import { Seguranca, Moderacao, Legal } from './Seguranca.jsx';

/* ─────────────────────────────────────────── bolha de mensagem */

function Bubble({ msg, mine, onReveal }) {
  const [content, setContent] = useState(null);
  const [left, setLeft] = useState(null);
  const [dying, setDying] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (left === null || left > 0) {
      if (left > 0) { const t = setTimeout(() => setLeft(left - 1), 1000); return () => clearTimeout(t); }
      return;
    }
    setDying(true);
    const t = setTimeout(() => setContent(null), 600);
    return () => clearTimeout(t);
  }, [left]);

  const reveal = async () => {
    setBusy(true);
    try {
      const out = await onReveal(msg.id);
      setContent(out);
      setLeft(Math.max(1, Math.round((new Date(out.expiresAt) - Date.now()) / 1000)));
    } catch (e) {
      setContent({ error: e.message });
    } finally { setBusy(false); }
  };

  const side = { alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%' };
  const when = new Date(msg.created_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  const stamp = (t) => <div className="m" style={{ marginTop: 5, textAlign: mine ? 'right' : 'left' }}>{t || when}</div>;

  if (msg.purged_at || content?.error || dying) return (
    <div className="in" style={side}>
      <div className="ghost">{msg.mode === 'once' ? <Eye size={14} /> : <Timer size={14} />}
        {msg.mode === 'once' ? 'Foto já vista' : 'Mensagem apagada'}</div>
      {stamp()}
    </div>
  );

  if (msg.mode !== 'normal' && !content) {
    if (mine) return (
      <div className="in" style={side}>
        <div className="ghost" style={{ borderStyle: 'solid', borderColor: 'rgba(43,43,247,.28)', color: 'var(--cobalt)' }}>
          {msg.mode === 'once' ? <Eye size={14} /> : <Timer size={14} />}
          {msg.mode === 'once' ? 'Foto enviada · uma vez' : 'Efémera · à espera'}
        </div>{stamp()}
      </div>
    );
    return (
      <div className="in" style={side}>
        <div className="veil" onClick={busy ? undefined : reveal}
          style={{ width: msg.mode === 'once' ? 200 : 'auto', height: msg.mode === 'once' ? 250 : 'auto' }}>
          {msg.mode === 'once' && <div style={{ position: 'absolute', inset: 0, background: PAL[msg.palette || 1].bg }} />}
          <div className="veil-in" style={{ position: msg.mode === 'once' ? 'absolute' : 'static', inset: 0, padding: msg.mode === 'once' ? 0 : '14px 18px' }}>
            {busy ? <Loader2 size={20} className="float" /> : msg.mode === 'once' ? <Eye size={22} /> : <Timer size={20} />}
            <span style={{ fontSize: 13, fontWeight: 600 }}>{msg.mode === 'once' ? 'Ver uma vez' : 'Toca para ler'}</span>
            <span className="m" style={{ color: 'rgba(20,18,42,.6)' }}>{msg.mode === 'once' ? 'não volta' : 'apaga-se depois'}</span>
          </div>
        </div>{stamp()}
      </div>
    );
  }

  const body = content?.body ?? msg.body;
  const media = content?.mediaUrl ?? msg.media_url;

  return (
    <div className="in" style={side}>
      {media ? (
        <img src={media} alt="" style={{ width: 220, borderRadius: 20, display: 'block', boxShadow: '0 6px 18px rgba(30,16,90,.2)' }} />
      ) : (
        <div style={{
          padding: '12px 16px', fontSize: 15, lineHeight: 1.4,
          borderRadius: mine ? '20px 20px 6px 20px' : '20px 20px 20px 6px',
          background: mine ? 'var(--cobalt)' : 'var(--card)', color: mine ? '#fff' : 'var(--ink)',
          boxShadow: mine ? '0 5px 16px rgba(43,43,247,.32)' : '0 3px 12px rgba(30,16,90,.12)',
        }}>{body}</div>
      )}
      {stamp(left > 0 ? `apaga em ${left} s` : undefined)}
    </div>
  );
}

/* ─────────────────────────────────────────── entrada */

function Entrada({ onIn }) {
  const [mode, setMode] = useState('login');   // login · registo · esqueci
  const [f, setF] = useState({ email: '', password: '', handle: '', name: '', birthDate: '' });
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [sent, setSent] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      if (mode === 'esqueci') { await api.account.forgot(f.email); setSent(true); return; }
      const out = mode === 'login'
        ? await api.auth.login({ email: f.email, password: f.password, code: code || undefined })
        : await api.auth.register({ ...f, acceptTerms: terms });
      // Password certa mas a conta tem dois passos: pedimos o codigo.
      if (out.needsCode) { setNeedsCode(true); return; }
      token.set(out.token);
      onIn(out.user);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: '100dvh', position: 'relative', background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
      <div style={{ position: 'absolute', top: -90, right: -70, width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%,#FFE9A8,#FF5442 70%)', filter: 'blur(3px)', opacity: .4 }} />
      <div style={{ position: 'absolute', bottom: -60, left: -70, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%,#DCD8FF,#2B2BF7 75%)', filter: 'blur(3px)', opacity: .32 }} />

      <div style={{ position: 'relative', maxWidth: 440, margin: '0 auto', padding: '52px 22px 40px' }}>
        <div className="up" style={{ marginBottom: 18 }}>
          <span className="m" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 6, height: 6, borderRadius: 9, background: 'var(--coral)' }} />
            Rede de amigos
          </span>
        </div>
        <h1 className="d up" style={{ fontSize: 'clamp(58px,17vw,84px)', animationDelay: '.06s' }}>
          Lumi<span className="it it-brand">na</span>
        </h1>
        <p className="up" style={{ fontSize: 16.5, lineHeight: 1.42, color: 'var(--grey)', margin: '20px 0 34px', maxWidth: 320, animationDelay: '.12s' }}>
          Uma pergunta por dia, escolhida pela tua gente — nunca por um algoritmo.
          Sem anúncios. Sem scroll infinito.
        </p>

        {sent ? (
          <div className="card in" style={{ padding: 22 }}>
            <h2 className="d" style={{ fontSize: 22, marginBottom: 10 }}>Vê o teu email</h2>
            <p style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--grey)' }}>
              Se essa conta existir, enviámos uma ligação para escolheres uma password nova.
              Expira dentro de uma hora.
            </p>
            <button className="p" style={{ marginTop: 18 }} onClick={() => { setSent(false); setMode('login'); }}>Voltar</button>
          </div>
        ) : (
          <form onSubmit={submit} className="card in" style={{ padding: 22, display: 'grid', gap: 12, animationDelay: '.18s' }}>
            {mode === 'registo' && (
              <>
                <input placeholder="Como te chamas" value={f.name} onChange={set('name')} autoComplete="name" required />
                <input placeholder="Nome de utilizador" value={f.handle} onChange={set('handle')}
                  autoCapitalize="none" autoCorrect="off" pattern="[a-z0-9._]{3,24}" required />
                <label className="m" style={{ marginTop: 4 }}>Data de nascimento</label>
                <input type="date" value={f.birthDate} onChange={set('birthDate')}
                  max={new Date(Date.now() - 16 * 365.25 * 864e5).toISOString().slice(0, 10)} required />
              </>
            )}
            <input type="email" placeholder="Email" value={f.email} onChange={set('email')}
              autoComplete="email" autoCapitalize="none" required />
            {mode !== 'esqueci' && (
              <input type="password" placeholder="Password" value={f.password} onChange={set('password')}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required />
            )}
            {needsCode && (
              <>
                <label className="m">Código da tua app de autenticação</label>
                <input inputMode="numeric" pattern="[0-9]*" maxLength={11} value={code} autoFocus
                  onChange={e => setCode(e.target.value)} placeholder="000000"
                  style={{ letterSpacing: '.25em', textAlign: 'center' }} />
                <p style={{ fontSize: 12.5, color: 'var(--grey)', lineHeight: 1.4 }}>
                  Perdeste o telemóvel? Usa um dos códigos de emergência que guardaste.
                </p>
              </>
            )}

            {mode === 'registo' && (
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.45, color: 'var(--grey)', marginTop: 4 }}>
                <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)}
                  style={{ width: 20, height: 20, flexShrink: 0, marginTop: 1, accentColor: 'var(--coral)' }} required />
                <span>
                  Tenho 16 anos ou mais e aceito os{' '}
                  <a href="/termos" style={{ color: 'var(--cobalt)' }}>termos</a> e a{' '}
                  <a href="/privacidade" style={{ color: 'var(--cobalt)' }}>política de privacidade</a>.
                </span>
              </label>
            )}

            <ErrorNote error={err} />

            <button className="p p-brand" disabled={busy || (mode === 'registo' && !terms)} style={{ padding: 15, fontSize: 15, marginTop: 4 }}>
              {busy ? 'Um momento…' : mode === 'login' ? 'Entrar' : mode === 'registo' ? 'Criar conta' : 'Enviar ligação'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <button type="button" className="m" style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
                onClick={() => { setErr(null); setMode(mode === 'login' ? 'registo' : 'login'); }}>
                {mode === 'login' ? 'Criar conta' : 'Já tenho conta'}
              </button>
              {mode === 'login' && (
                <button type="button" className="m" style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
                  onClick={() => { setErr(null); setMode('esqueci'); }}>Esqueci a password</button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────── abertura */

function Abertura({ me, coms, days, onAnswer, onSkip }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const a = setTimeout(() => setStep(1), 240);
    const b = setTimeout(() => setStep(2), 900);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  const main = coms.find(c => c.invite_id && !c.answered) || coms.find(c => c.invite_id) || coms[0];
  const pending = coms.filter(c => c.invite_id && !c.answered).length;
  const words = (main?.invite_text || '').split(' ');
  const hours = main?.closes_at ? Math.max(0, Math.round((new Date(main.closes_at) - Date.now()) / 3600000)) : 0;
  const total = days.filter(d => d.answered).length;

  return (
    <div style={{ minHeight: '100dvh', position: 'relative', background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
      {step >= 1 && (<>
        <div className="halo" style={{ top: -70, right: -60, width: 240, height: 240, background: '#FF9A7E' }} />
        <div className="halo" style={{ bottom: 130, left: -80, width: 220, height: 220, background: '#9C93F2', animationDelay: '.3s' }} />
      </>)}

      <div style={{ position: 'relative', maxWidth: 460, margin: '0 auto', padding: '26px 20px 40px', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 38 }}>
          {step === 0 ? <Skeleton w={38} h={38} r={99} /> : <div className="pill"><Orb p={me.palette} s={38} /></div>}
          <div style={{ flex: 1 }}>
            {step === 0 ? <Skeleton w={96} h={11} /> : <div className="m up">Olá, {me.name.split(' ')[0]}</div>}
          </div>
          {step === 0 ? <Skeleton w={74} h={11} /> : <div className="m up" style={{ animationDelay: '.1s' }}>{main?.name}</div>}
        </div>

        <div style={{ marginBottom: 30 }}>
          {step === 0 ? (
            <><Skeleton w="58%" h={15} st={{ marginBottom: 18 }} /><Skeleton w="90%" h={44} st={{ marginBottom: 12 }} /><Skeleton w="62%" h={44} /></>
          ) : !main?.invite_text ? (
            <>
              <div className="m up" style={{ color: 'var(--coral)', marginBottom: 16 }}>Hoje sem convite</div>
              <h1 className="d up" style={{ fontSize: 'clamp(34px,9vw,46px)' }}>A tua comunidade ficou sem <span className="it">propostas</span></h1>
              <p className="up" style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--grey)', marginTop: 16 }}>
                Deixa uma ideia na lista para amanhã haver convite.
              </p>
            </>
          ) : (
            <>
              <div className="m up" style={{ color: 'var(--coral)', marginBottom: 16 }}>
                O convite de hoje · faltam {hours} h
              </div>
              <h1 className="d" style={{ fontSize: 'clamp(42px,12vw,58px)' }}>
                {words.map((w, i) => (
                  <span key={i} className="w" style={{ animationDelay: `${i * 130}ms`, marginRight: '.22em' }}>
                    {i === words.length - 1 ? <span className="it">{w}</span> : w}
                  </span>
                ))}
              </h1>
            </>
          )}
        </div>

        {step >= 2 && main?.reply_count > 0 && (
          <div className="up" style={{ fontSize: 14, color: 'var(--grey)', marginBottom: 30 }}>
            {main.reply_count} {main.reply_count === 1 ? 'pessoa já respondeu' : 'pessoas já responderam'}
          </div>
        )}

        {step >= 2 && (
          <div className="up" style={{ animationDelay: '.22s', marginBottom: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 13 }}>
              <span className="m">Os teus dias</span>
              <span className="m">{total} respostas · 4 semanas</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(14,1fr)', gap: 7 }}>
              {days.slice(0, 27).map((d, i) => (
                <div key={d.date} className="dot" style={{
                  aspectRatio: '1', background: d.answered ? 'var(--ink)' : 'rgba(20,18,42,.09)',
                  transform: d.answered ? 'none' : 'scale(.62)', transitionDelay: `${i * 22}ms`,
                }} />
              ))}
              <div className="dot glow" style={{ aspectRatio: '1', background: 'var(--coral)' }} />
            </div>
            <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--grey)', margin: '14px 2px 0' }}>
              Os dias que falhaste ficam em branco e ficam assim. Não há contador a
              zerar nem nada a perder — só o desenho a crescer.
            </p>
          </div>
        )}

        <div style={{ marginTop: 34 }}>
          {step === 0 ? <Skeleton w="100%" h={52} r={99} /> : step >= 2 && (
            <>
              {main?.invite_id && !main.answered && (
                <button className="p p-cr up" onClick={() => onAnswer(main)}
                  style={{ width: '100%', padding: 15, fontSize: 15, animationDelay: '.34s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
                  Responder ao convite <ArrowUpRight size={17} />
                </button>
              )}
              <button className="p up" onClick={onSkip}
                style={{ width: '100%', marginTop: 10, animationDelay: '.42s', background: 'transparent', boxShadow: 'none', color: 'var(--grey)' }}>
                {pending > 1 ? `Ver o feed · +${pending - 1} convites por responder` : 'Ver o feed'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────── aplicação */

export default function App() {
  const [me, setMe] = useState(null);
  const [booting, setBooting] = useState(true);
  const [opening, setOpening] = useState(false);
  const [tab, setTab] = useState('feed');
  const [toast, setToast] = useState('');

  const [coms, setComs] = useState([]);
  const [days, setDays] = useState([]);
  const [feed, setFeed] = useState([]);
  const [feedErr, setFeedErr] = useState(null);
  const [loadingFeed, setLoadingFeed] = useState(true);

  const [pick, setPick] = useState(null);
  const [invite, setInvite] = useState(null);
  const [pool, setPool] = useState([]);
  const [idea, setIdea] = useState('');

  const [threads, setThreads] = useState([]);
  const [thread, setThread] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [mode, setMode] = useState('normal');

  const [comp, setComp] = useState(null);
  const [body, setBody] = useState('');
  const [palette, setPalette] = useState(0);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const [comments, setComments] = useState({});
  const [draft, setDraft] = useState('');
  const [burst, setBurst] = useState(null);
  const [menuFor, setMenuFor] = useState(null);   // id do post com o menu denunciar/bloquear aberto
  const [blocked, setBlocked] = useState([]);
  const [screen, setScreen] = useState(null);   // seguranca · moderacao · termos · privacidade

  const end = useRef(null);
  const fileInput = useRef(null);
  const ping = (t) => { setToast(t); setTimeout(() => setToast(''), 2600); };

  /* arranque: se há token, tenta retomar a sessão */
  useEffect(() => {
    (async () => {
      if (!token.get()) return setBooting(false);
      try {
        const user = await api.auth.me();
        await afterLogin(user);
      } catch { token.clear(); }
      finally { setBooting(false); }
    })();
  }, []);

  async function afterLogin(user) {
    setMe(user);
    const [c, d] = await Promise.all([
      api.communities.mine().catch(() => []),
      api.account.days().catch(() => ({ days: [] })),
    ]);
    setComs(c); setDays(d.days || []);
    setPick(c[0]?.id || null);
    setOpening(true);
    loadFeed();
  }

  const loadFeed = useCallback(async () => {
    setLoadingFeed(true); setFeedErr(null);
    try { setFeed((await api.posts.feed()).posts); }
    catch (e) { setFeedErr(e); }
    finally { setLoadingFeed(false); }
  }, []);

  useEffect(() => {
    if (!pick) return;
    api.invites.today(pick).then(setInvite).catch(() => setInvite(null));
    api.invites.proposals(pick).then(r => setPool(r.proposals)).catch(() => setPool([]));
  }, [pick]);

  useEffect(() => { if (tab === 'dms') api.messages.threads().then(setThreads).catch(() => {}); }, [tab]);
  useEffect(() => { if (tab === 'me') api.users.blocked().then(setBlocked).catch(() => {}); }, [tab]);
  useEffect(() => {
    if (!thread) return;
    api.messages.list(thread.id).then(setMsgs).catch(() => {});
    const t = setInterval(() => api.messages.list(thread.id).then(setMsgs).catch(() => {}), 5000);
    return () => clearInterval(t);
  }, [thread]);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [msgs]);

  const logout = () => { token.clear(); setMe(null); setTab('feed'); };

  /* ── ações ── */

  const react = async (post, kind) => {
    const key = kind === 'like' ? 'likes' : 'fires';
    const had = (post.my_reactions || []).includes(kind);
    setFeed(f => f.map(p => p.id === post.id ? {
      ...p, [key]: p[key] + (had ? -1 : 1),
      my_reactions: had ? p.my_reactions.filter(r => r !== kind) : [...(p.my_reactions || []), kind],
    } : p));
    if (!had) { setBurst({ id: post.id, kind, n: Date.now() }); setTimeout(() => setBurst(null), 560); }
    try { await api.posts.react(post.id, kind); }
    catch { loadFeed(); ping('Não foi possível reagir'); }
  };

  const repost = async (post) => {
    try { await api.posts.repost(post.id); await loadFeed(); ping('Republicado'); }
    catch (e) { ping(e.message); }
  };

  const loadComments = async (id) => {
    setOpen(open === id ? null : id); setDraft('');
    if (open !== id && !comments[id]) {
      try {
        const list = await api.posts.comments(id);
        setComments(c => ({ ...c, [id]: list }));
      } catch {}
    }
  };

  const comment = async (id) => {
    if (!draft.trim()) return;
    const text = draft.trim(); setDraft('');
    try {
      await api.posts.comment(id, text);
      setComments(c => ({ ...c, [id]: [...(c[id] || []), { id: Math.random(), body: text, name: me.name, handle: me.handle, palette: me.palette }] }));
      setFeed(f => f.map(p => p.id === id ? { ...p, comments: p.comments + 1 } : p));
    } catch (e) { ping(e.message); setDraft(text); }
  };

  const vote = async (p) => {
    setPool(list => list.map(x => x.id === p.id ? { ...x, voted: !x.voted, vote_count: x.vote_count + (x.voted ? -1 : 1) } : x));
    try { await api.invites.vote(p.id); }
    catch (e) { ping(e.message); api.invites.proposals(pick).then(r => setPool(r.proposals)); }
  };

  const propose = async () => {
    if (!idea.trim()) return;
    try {
      await api.invites.propose(pick, idea.trim());
      setIdea('');
      const r = await api.invites.proposals(pick); setPool(r.proposals);
      ping('Na lista. Se ganhar votos, é o convite de um dia destes.');
    } catch (e) { ping(e.message); }
  };

  const publish = async () => {
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      let mediaUrl = null;
      if (file) mediaUrl = await api.upload(file);
      await api.posts.create({
        communityId: comp.community, body: body.trim(), mediaUrl, palette,
        inviteId: comp.inviteId || null,
      });
      setBody(''); setFile(null); setComp(null);
      await Promise.all([loadFeed(), api.communities.mine().then(setComs), api.account.days().then(d => setDays(d.days))]);
      ping(comp.inviteId ? 'Respondeste. Vê as outras respostas.' : 'Publicado');
    } catch (e) { ping(e.message); }
    finally { setBusy(false); }
  };

  const send = async () => {
    if (mode !== 'once' && !text.trim()) return;
    const payload = mode === 'once'
      ? { kind: 'media', mode: 'once', palette }
      : { kind: 'text', mode, body: text.trim() };
    setText('');
    try {
      await api.messages.send(thread.id, payload);
      setMsgs(await api.messages.list(thread.id));
      if (mode === 'timer') ping('Apaga-se pouco depois de ser aberta');
      setMode('normal');
    } catch (e) { ping(e.message); }
  };

  const report = async (type, id) => {
    try { const r = await api.reports.create({ targetType: type, targetId: id, reason: 'abuso' });
      ping(r.hidden ? 'Denunciado e escondido até ser revisto' : 'Denunciado. Obrigado.'); }
    catch (e) { ping(e.code === 'duplicate' ? 'Já tinhas denunciado' : e.message); }
  };

  /* ── ecrãs ── */

  if (booting) return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
      <div className="d" style={{ fontSize: 34, opacity: .25 }}>Lumi<span className="it">na</span></div>
    </div>
  );

  if (!me) return <Entrada onIn={afterLogin} />;

  if (opening) return (
    <Abertura me={me} coms={coms} days={days}
      onSkip={() => setOpening(false)}
      onAnswer={(c) => { setOpening(false); setPick(c.id); setComp({ community: c.id, inviteId: c.invite_id, title: c.invite_text }); }} />
  );

  if (screen === 'seguranca') return <Seguranca onBack={() => setScreen(null)} ping={ping} />;
  if (screen === 'moderacao') return <Moderacao communities={coms} onBack={() => setScreen(null)} ping={ping} />;
  if (screen === 'TERMOS' || screen === 'PRIVACIDADE') return <Legal page={screen} onBack={() => setScreen(null)} />;

  const Nav = () => (
    <div className="nav">
      {[['feed', Home, 'Feed'], ['invites', Sparkles, 'Convites'], ['new', Plus, 'Novo'], ['dms', Send, 'Conversas'], ['me', User, 'Perfil']].map(([k, I, l]) => (
        <button key={k} className={`nb${tab === k ? ' nb-on' : ''}`}
          onClick={() => { if (k === 'new') return setComp({ community: coms[0]?.id, title: 'Publicar' }); setTab(k); setThread(null); }}>
          <I size={21} strokeWidth={tab === k ? 2.4 : 1.9} />{l}
          {k === 'invites' && coms.some(c => c.invite_id && !c.answered) && <span className="dot-badge" />}
          {k === 'dms' && threads.some(t => t.unread > 0) && <span className="dot-badge" />}
        </button>
      ))}
    </div>
  );

  /* conversa */
  if (tab === 'dms' && thread) {
    const MODES = [['normal', MessageSquare, 'Normal'], ['timer', Timer, 'Efémera'], ['once', Eye, 'Uma vez']];
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--paper)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16 }}>
          <button className="p" onClick={() => setThread(null)} aria-label="Voltar às conversas" style={{ padding: 10 }}><ArrowLeft size={16} /></button>
          <Orb p={thread.palette} s={36} />
          <div><div style={{ fontSize: 15, fontWeight: 600 }}>{thread.name}</div><div className="m">@{thread.handle}</div></div>
        </div>
        <div className="ns" style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {msgs.length === 0 && <Empty>Diz olá.</Empty>}
          {msgs.map(m => <Bubble key={m.id} msg={m} mine={m.sender_id === me.id} onReveal={api.messages.reveal} />)}
          <div ref={end} />
        </div>
        <div style={{ padding: '0 14px 16px' }}>
          <div className="ns" style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 9 }}>
            {MODES.map(([k, I, l]) => (
              <button key={k} onClick={() => setMode(k)}
                className={`p p-sm${mode === k ? (k === 'once' ? ' p-cr' : k === 'timer' ? ' p-co' : ' p-ink') : ''}`}
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}><I size={13} />{l}</button>
            ))}
          </div>
          {mode !== 'normal' && (
            <p style={{ fontSize: 11.5, lineHeight: 1.4, color: 'var(--grey)', marginBottom: 9 }}>
              {mode === 'timer'
                ? 'Apaga-se pouco depois de ser aberta. Não impedimos capturas de ecrã.'
                : 'Abre uma vez e não volta. Não impedimos capturas de ecrã.'}
            </p>
          )}
          <div style={{ display: 'flex', gap: 9 }}>
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
              placeholder={mode === 'timer' ? 'Mensagem efémera…' : mode === 'once' ? 'Foto de uma vez' : 'Escrever…'} />
            <button className={mode === 'timer' ? 'p p-co' : mode === 'once' ? 'p p-cr' : 'p p-ink'}
              onClick={send} aria-label={mode === 'once' ? 'Enviar foto' : 'Enviar mensagem'} style={{ padding: '12px 15px' }}>
              {mode === 'once' ? <Camera size={16} /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* conversas */
  if (tab === 'dms') return (
    <div style={{ minHeight: '100dvh', paddingBottom: 100, background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
      <div style={{ maxWidth: 460, margin: '0 auto', padding: 20 }}>
        <h2 className="d" style={{ fontSize: 42, margin: '10px 0 26px' }}>Conver<span className="it">sas</span></h2>
        {threads.length === 0 && <Empty>Ainda sem conversas.<br />Abre o perfil de alguém para falar.</Empty>}
        <div style={{ display: 'grid', gap: 11 }}>
          {threads.map((t, i) => (
            <button key={t.id} onClick={() => setThread({ id: t.id, name: t.name, handle: t.handle, palette: t.palette })}
              className="card in" style={{ border: 0, cursor: 'pointer', padding: 15, display: 'flex', gap: 13, alignItems: 'center', textAlign: 'left', animationDelay: `${i * 60}ms` }}>
              <Orb p={t.palette} s={44} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{t.name}</span>
                <span style={{ display: 'block', fontSize: 14, color: 'var(--grey)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.body || 'Sem mensagens'}
                </span>
              </span>
              {t.unread > 0 && <span style={{ width: 9, height: 9, borderRadius: 9, background: 'var(--coral)', boxShadow: '0 0 0 4px rgba(255,84,66,.2)' }} />}
            </button>
          ))}
        </div>
      </div>
      <Nav />
    </div>
  );

  /* convites */
  if (tab === 'invites') {
    const cur = coms.find(c => c.id === pick);
    const sorted = [...pool].sort((a, b) => b.vote_count - a.vote_count);
    const tomorrow = sorted[0];
    const hours = cur?.closes_at ? Math.max(0, Math.round((new Date(cur.closes_at) - Date.now()) / 3600000)) : 0;

    return (
      <div style={{ minHeight: '100dvh', paddingBottom: 100, background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px' }}>
          <h2 className="d" style={{ fontSize: 42, margin: '10px 0 10px' }}>Con<span className="it">vites</span></h2>
          <p style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--grey)', margin: '0 0 20px' }}>
            Cada comunidade tem o seu. Qualquer membro pode propor; o mais votado é o de amanhã.
          </p>

          <div className="ns" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 20 }}>
            {coms.map(c => (
              <button key={c.id} onClick={() => setPick(c.id)} className={pick === c.id ? 'p p-sm p-ink' : 'p p-sm'} style={{ flexShrink: 0, position: 'relative' }}>
                {c.name}
                {c.invite_id && !c.answered && <span style={{ position: 'absolute', top: 2, right: 4, width: 6, height: 6, borderRadius: 9, background: 'var(--coral)' }} />}
              </button>
            ))}
          </div>

          <div className="card in" key={pick} style={{ padding: 20, marginBottom: 12, background: PAL[coms.findIndex(c => c.id === pick) % 5].chip }}>
            {!cur?.invite_id ? (
              <>
                <div className="m" style={{ marginBottom: 8 }}>Hoje sem convite</div>
                <p style={{ fontSize: 15, lineHeight: 1.45 }}>
                  Esta comunidade ficou sem propostas. Deixa uma ideia em baixo para amanhã haver convite.
                </p>
              </>
            ) : (<>
              <div className="m" style={{ marginBottom: 8 }}>Hoje em {cur.name} · faltam {hours} h</div>
              <div className="d" style={{ fontSize: 32, marginBottom: 10, lineHeight: .96 }}>{cur.invite_text}</div>
              <div className="m" style={{ marginBottom: 16 }}>{cur.reply_count} respostas</div>
              {cur.answered
                ? <div className="m" style={{ color: 'rgba(20,18,42,.6)' }}>Respondeste · vê tudo no feed</div>
                : <button className="p p-cr" style={{ width: '100%', padding: 14, fontSize: 15 }}
                    onClick={() => setComp({ community: cur.id, inviteId: cur.invite_id, title: cur.invite_text })}>Responder</button>}
            </>)}
          </div>

          {tomorrow && (
            <div className="card rise" key={tomorrow.id} style={{ padding: 20, marginBottom: 26 }}>
              <div className="m" style={{ marginBottom: 8 }}>Amanhã · o mais votado</div>
              <div className="d" style={{ fontSize: 23, marginBottom: 8, lineHeight: 1 }}>{tomorrow.text}</div>
              <div className="m">{tomorrow.vote_count} votos · de {tomorrow.author_name || 'alguém'}</div>
              <p style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--grey)', marginTop: 14 }}>
                Ainda pode mudar. Vota noutra ideia e vê este cartão trocar.
              </p>
            </div>
          )}

          <div className="m" style={{ marginBottom: 10 }}>Propor um convite</div>
          <div style={{ display: 'flex', gap: 9, marginBottom: 26 }}>
            <input value={idea} onChange={e => setIdea(e.target.value)} onKeyDown={e => e.key === 'Enter' && propose()}
              placeholder="ex: uma coisa que não acabaste" maxLength={120} />
            <button className="p p-ink" onClick={propose} disabled={!idea.trim()} aria-label="Propor convite" style={{ padding: '12px 16px' }}><Plus size={16} /></button>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 className="d" style={{ fontSize: 21 }}>Em <span className="it">votação</span></h3>
            <span className="m">{sorted.length} ideias</span>
          </div>
          {sorted.length === 0 && <Empty>Ainda sem propostas. Deixa a primeira.</Empty>}
          <div style={{ display: 'grid', gap: 10 }}>
            {sorted.map((x, i) => (
              <div key={x.id} className="card in" style={{
                padding: 14, display: 'flex', alignItems: 'center', gap: 12, animationDelay: `${i * 45}ms`,
                boxShadow: i === 0 ? '0 0 0 2px var(--coral),0 14px 32px -10px rgba(30,16,90,.26)' : undefined,
              }}>
                <button onClick={() => vote(x)} style={{
                  border: 0, borderRadius: 15, cursor: 'pointer', padding: '9px 10px', minWidth: 48,
                  display: 'grid', placeItems: 'center', gap: 1, transition: 'background .2s',
                  background: x.voted ? 'var(--ink)' : '#F1EFFA', color: x.voted ? '#fff' : 'var(--ink)',
                }}>
                  <ArrowUp size={14} strokeWidth={2.7} /><span style={{ fontSize: 12, fontWeight: 700 }}>{x.vote_count}</span>
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1.25 }}>{x.text}</div>
                  <div className="m" style={{ marginTop: 4 }}>{i === 0 ? 'a ganhar · ' : ''}{x.author_name || 'alguém'}</div>
                </div>
                <button onClick={() => report('proposal', x.id)} aria-label="Denunciar proposta" style={{ background: 'none', border: 0, cursor: 'pointer', color: '#C4BEDC', padding: 6 }}>
                  <Flag size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
        <Composer />
        <Nav />
        <Toast />
      </div>
    );
  }

  /* perfil */
  if (tab === 'me') return (
    <div style={{ minHeight: '100dvh', paddingBottom: 100, background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
      <div style={{ maxWidth: 460, margin: '0 auto', padding: 20 }}>
        <Orb p={me.palette} s={82} cls="float" />
        <h2 className="d" style={{ fontSize: 38, margin: '26px 0 8px' }}>{me.name}</h2>
        <div className="m">@{me.handle} · {me.followers || 0} seguidores</div>
        <p style={{ fontSize: 16, lineHeight: 1.45, color: 'var(--grey)', margin: '16px 0 22px' }}>{me.bio || 'Sem descrição.'}</p>

        <div className="m" style={{ marginBottom: 9 }}>As tuas comunidades</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 24 }}>
          {coms.map((c, i) => <span key={c.id} className="star" style={{ background: PAL[i % 5].chip }}>{c.name}</span>)}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 11, marginBottom: 24 }}>
          {[['Dias respondidos', days.filter(d => d.answered).length, PAL[3].chip],
            ['Comunidades', coms.length, PAL[1].chip]].map(([l, v, bg]) => (
            <div key={l} style={{ background: bg, borderRadius: 22, padding: '18px 16px', boxShadow: 'inset 0 2px 0 rgba(255,255,255,.7),0 10px 22px -6px rgba(30,16,90,.24)' }}>
              <div className="d" style={{ fontSize: 30 }}>{v}</div>
              <div className="m" style={{ marginTop: 5, color: 'rgba(20,18,42,.55)' }}>{l}</div>
            </div>
          ))}
        </div>

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
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>Segurança da conta</span>
          <ArrowUpRight size={17} color="#ADA6CC" />
        </button>

        {coms.some(c => c.role === 'moderator' || c.role === 'founder') && (
          <button className="card" onClick={() => setScreen('moderacao')}
            style={{ width: '100%', border: 0, cursor: 'pointer', padding: 18, textAlign: 'left', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Flag size={17} color="var(--grey)" />
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>Moderação</span>
            <ArrowUpRight size={17} color="#ADA6CC" />
          </button>
        )}

        <div className="card" style={{ padding: 18, marginBottom: 12 }}>
          <div className="m" style={{ marginBottom: 10 }}>Pessoas bloqueadas</div>
          {blocked.length === 0
            ? <p style={{ fontSize: 14, color: 'var(--grey)' }}>Ninguém bloqueado.</p>
            : blocked.map(b => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 0' }}>
                <Orb p={b.palette} s={30} />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{b.name}</span>
                <button className="p p-sm" onClick={async () => {
                  try { await api.users.unblock(b.id); setBlocked(await api.users.blocked()); ping('Desbloqueado'); }
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
      <Nav />
      <Toast />
    </div>
  );

  /* feed */
  const main = coms.find(c => c.invite_id && !c.answered);

  function Toast() {
    return toast ? (
      <div className="in" style={{
        position: 'fixed', bottom: 92, left: '50%', transform: 'translateX(-50%)', zIndex: 70,
        background: 'var(--ink)', color: '#fff', padding: '13px 22px', borderRadius: 999,
        fontSize: 14, fontWeight: 600, maxWidth: '86%', textAlign: 'center',
        boxShadow: '0 12px 30px rgba(20,18,42,.36)',
      }}>{toast}</div>
    ) : null;
  }

  function Composer() {
    if (!comp) return null;
    return (
      <div onClick={() => !busy && setComp(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(24,18,60,.36)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', zIndex: 60 }}>
        <div onClick={e => e.stopPropagation()} className="in" style={{ background: 'linear-gradient(180deg,#F3F1FC,#E9E7F8)', borderRadius: '30px 30px 0 0', width: '100%', maxWidth: 560, margin: '0 auto', padding: '22px 20px calc(26px + env(safe-area-inset-bottom))' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
            <h3 className="d" style={{ fontSize: 26, flex: 1, lineHeight: 1 }}>{comp.title}</h3>
            <button className="p" onClick={() => setComp(null)} aria-label="Fechar" style={{ padding: 10 }}><X size={16} /></button>
          </div>

          {!comp.inviteId && coms.length > 1 && (
            <div className="ns" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 14 }}>
              {coms.map(c => (
                <button key={c.id} className={comp.community === c.id ? 'p p-sm p-ink' : 'p p-sm'}
                  onClick={() => setComp({ ...comp, community: c.id })} style={{ flexShrink: 0 }}>{c.name}</button>
              ))}
            </div>
          )}

          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
            onChange={e => setFile(e.target.files?.[0] || null)} />
          <button className="p" onClick={() => fileInput.current?.click()}
            style={{ width: '100%', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Image size={15} />{file ? file.name.slice(0, 28) : 'Escolher uma foto'}
          </button>

          {!file && (
            <div className="scene" style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              {PAL.map((t, i) => (
                <button key={i} onClick={() => setPalette(i)} className="st"
                  style={{ width: 48, height: 60, background: t.bg, border: 0, cursor: 'pointer', padding: 0, transform: palette === i ? 'translateY(-6px) scale(1.06)' : 'none' }}>
                  <div className="gloss" />
                </button>
              ))}
            </div>
          )}

          <textarea rows={3} value={body} onChange={e => setBody(e.target.value)}
            placeholder="O que estás a ver?" style={{ marginBottom: 16, resize: 'none' }} maxLength={2000} />
          <button className="p p-cr" onClick={publish} disabled={!body.trim() || busy}
            style={{ width: '100%', padding: 15, fontSize: 15 }}>
            {busy ? 'A enviar…' : comp.inviteId ? 'Responder' : 'Publicar'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', paddingBottom: 96 }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(239,237,251,.9)', backdropFilter: 'blur(14px)' }}>
        <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <h1 className="d" style={{ fontSize: 25, flex: 1 }}>Lumi<span className="it">na</span></h1>
          <button className="p" onClick={loadFeed} aria-label="Atualizar feed" style={{ padding: 10 }}><Search size={16} /></button>
        </div>
      </header>

      {main && (
        <button onClick={() => setTab('invites')} className="sect"
          style={{ width: '100%', border: 0, textAlign: 'left', cursor: 'pointer', padding: '18px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
              <Sparkles size={14} color="var(--coral)" />
              <span className="m" style={{ color: 'var(--coral)' }}>Convite de hoje · {main.name}</span>
            </div>
            <div className="d" style={{ fontSize: 25, marginBottom: 6, lineHeight: .98 }}>{main.invite_text}</div>
            <div className="m">Responde para ver as outras</div>
          </div>
          <span style={{ width: 10, height: 10, borderRadius: 9, background: 'var(--coral)', flexShrink: 0 }} />
          <ArrowUpRight size={20} color="#ADA6CC" />
        </button>
      )}

      <div style={{ padding: '0 16px' }}><ErrorNote error={feedErr} onRetry={loadFeed} /></div>

      {loadingFeed ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {[0, 1].map(i => (
            <div key={i} className="sect" style={{ padding: '13px 0' }}>
              <div style={{ display: 'flex', gap: 11, padding: '0 16px 13px', alignItems: 'center' }}>
                <Skeleton w={38} h={38} r={99} /><div style={{ flex: 1 }}><Skeleton w="45%" h={13} /></div>
              </div>
              <Skeleton w="100%" h={280} r={0} />
              <div style={{ padding: '14px 16px' }}><Skeleton w="70%" h={13} /></div>
            </div>
          ))}
        </div>
      ) : feed.length === 0 ? (
        <Empty>
          O teu feed está vazio.<br />
          Responde ao convite de hoje ou junta-te a mais comunidades.
        </Empty>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {feed.map((p, i) => {
            const mine = p.my_reactions || [];
            const cs = comments[p.id] || [];
            return (
              <article key={p.id} className="sect in" style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}>
                {p.repost_of && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px 0', color: 'var(--grey)' }}>
                    <Repeat2 size={14} /><span className="m">{p.author_id === me.id ? 'Republicaste' : `${p.name} republicou`}</span>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 16px' }}>
                  <Orb p={p.author_palette} s={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.02em' }}>{p.name}</div>
                    <div className="m" style={{ marginTop: 2 }}>
                      {p.community_name} · {new Date(p.created_at).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}
                    </div>
                  </div>
                  {p.author_id !== me.id && (
                    <div style={{ position: 'relative' }}>
                      <button onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}
                        aria-label="Mais opções" style={{ background: 'none', border: 0, cursor: 'pointer', color: '#C4BEDC', padding: 6 }}>
                        <Flag size={15} />
                      </button>
                      {menuFor === p.id && (
                        <div className="card in" style={{
                          position: 'absolute', top: '100%', right: 0, zIndex: 30, minWidth: 150,
                          padding: 6, display: 'grid',
                        }}>
                          <button className="act" style={{ padding: '9px 10px', justifyContent: 'flex-start' }}
                            onClick={() => { setMenuFor(null); report('post', p.id); }}>Denunciar</button>
                          <button className="act" style={{ padding: '9px 10px', justifyContent: 'flex-start', color: 'var(--coral)' }}
                            onClick={() => {
                              setMenuFor(null);
                              api.users.block(p.author_id)
                                .then(() => { loadFeed(); ping(`${p.name} bloqueado`); })
                                .catch(e => ping(e.message));
                            }}>Bloquear {p.name}</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {p.media_url ? (
                  <img src={p.media_url} alt="" loading="lazy"
                    style={{ width: '100%', aspectRatio: '4/5', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div className="block" style={{ width: '100%', aspectRatio: '4 / 5', background: PAL[p.palette % 5].bg }}>
                    <div className="gloss" />
                    <Orb p={p.palette} s={76} cls="float" st={{ position: 'absolute', bottom: 26, left: 22 }} />
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '13px 16px 4px', position: 'relative' }}>
                  <button className={`act${mine.includes('like') ? '' : ' act-off'}`} onClick={() => react(p, 'like')}>
                    <span className="em" style={{ filter: mine.includes('like') ? 'none' : 'grayscale(1) opacity(.55)' }}>👍</span>{p.likes}
                  </button>
                  <button className={`act${mine.includes('fire') ? '' : ' act-off'}`} onClick={() => react(p, 'fire')}>
                    <span className="em" style={{ filter: mine.includes('fire') ? 'none' : 'grayscale(1) opacity(.55)' }}>🔥</span>{p.fires}
                  </button>
                  <button className="act act-off" onClick={() => repost(p)} aria-label="Republicar"><Repeat2 size={20} />{p.reposts}</button>
                  <button className="act act-off" onClick={() => loadComments(p.id)}>
                    <span className="em" style={{ filter: 'grayscale(1) opacity(.55)' }}>💬</span>{p.comments}
                  </button>
                  {burst?.id === p.id && (
                    <span key={burst.n} className="pop" style={{ top: 2, left: burst.kind === 'like' ? 4 : 74, fontSize: 26 }}>
                      {burst.kind === 'like' ? '👍' : '🔥'}
                    </span>
                  )}
                </div>

                <p style={{ fontSize: 16, lineHeight: 1.4, letterSpacing: '-.015em', margin: '6px 16px 16px' }}>
                  <b style={{ fontWeight: 600 }}>{p.handle}</b> {p.body}
                </p>

                {open === p.id && (
                  <div className="in" style={{ padding: '0 16px 18px' }}>
                    <div style={{ borderTop: '1px solid #EAE6F8', paddingTop: 15 }}>
                      {cs.length === 0 && <div className="m" style={{ marginBottom: 14 }}>Sem comentários. Escreve o primeiro.</div>}
                      <div style={{ display: 'grid', gap: 13, marginBottom: 15 }}>
                        {cs.map(c => (
                          <div key={c.id} style={{ display: 'flex', gap: 11 }}>
                            <Orb p={c.palette} s={26} />
                            <div><div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                              <div style={{ fontSize: 15, lineHeight: 1.4, marginTop: 2, color: '#332E4E' }}>{c.body}</div></div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 9 }}>
                        <input value={draft} onChange={e => setDraft(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && comment(p.id)} placeholder="Escrever um comentário" />
                        <button className="p p-ink" onClick={() => comment(p.id)} disabled={!draft.trim()} style={{ padding: '12px 15px' }}>
                          <Send size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Composer />
      <Nav />
      <Toast />
    </div>
  );
}
