import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, Plus, ArrowLeft, ArrowUpRight, Send, Timer, Eye, MessageSquare, Camera, Repeat2, Sparkles, User, Users, ArrowUp, Flag, Shield } from 'lucide-react';
import { api, onUnauthorized } from './api.js';
import { PAL, Orb, Skeleton, ErrorNote, Empty } from './ui.jsx';
import { Seguranca, Moderacao, Legal } from './Seguranca.jsx';
import { Bubble } from './components/messages/Bubble.jsx';
import { Composer, Nav, Toast } from './components/AppChrome.jsx';
import { MomentComposer, MomentRing, MomentViewer } from './components/Moments.jsx';
import { Marco, Welcome, checkMilestone } from './components/Milestones.jsx';
import { Entrada } from './screens/Entrada.jsx';
import { Abertura } from './screens/Abertura.jsx';
import { EditarPerfil } from './screens/EditarPerfil.jsx';
import { Amigos } from './screens/Amigos.jsx';
import { Comunidades } from './screens/Comunidades.jsx';

/**
 * App fica responsável por estado global e orquestração. Ecrãs e componentes
 * visuais vivem em módulos próprios para evitar que cada alteração transforme
 * este ficheiro num monólito impossível de testar.
 */
export default function App() {
  const [me, setMe] = useState(null);
  const [booting, setBooting] = useState(true);
  const [opening, setOpening] = useState(false);
  const [milestone, setMilestone] = useState(null);
  const [showWelcome, setShowWelcome] = useState(false);
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
  const [menuFor, setMenuFor] = useState(null);

  const [moments, setMoments] = useState([]);
  const [viewingAuthor, setViewingAuthor] = useState(null);
  const [momentComposer, setMomentComposer] = useState(false);
  const [momentFile, setMomentFile] = useState(null);
  const [momentPalette, setMomentPalette] = useState(0);
  const [momentBusy, setMomentBusy] = useState(false);
  const [blocked, setBlocked] = useState([]);
  const [screen, setScreen] = useState(null);

  const end = useRef(null);
  const ping = (t) => { setToast(t); setTimeout(() => setToast(''), 2600); };

  const meRef = useRef(null);
  useEffect(() => { meRef.current = me; }, [me]);

  useEffect(() => {
    onUnauthorized(() => {
      if (meRef.current) {
        setMe(null);
        setTab('feed');
        ping('A sessão expirou. Entra outra vez.');
      }
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const user = await api.auth.me();
        await afterLogin(user);
      } catch { /* sem sessão — fica no ecrã de entrada */ }
      finally { setBooting(false); }
    })();
  }, []);

  async function afterLogin(user, isNewAccount = false) {
    setMe(user);
    if (isNewAccount) setShowWelcome(true);
    const [c, d] = await Promise.all([
      api.communities.mine().catch(() => []),
      api.account.days().catch(() => ({ days: [] })),
    ]);
    setComs(c); setDays(d.days || []);
    setMilestone(checkMilestone(d.lifetime, user.id));
    setPick(c[0]?.id || null);
    setOpening(true);
    loadFeed();
    loadMoments();
  }

  const loadMoments = useCallback(() => {
    api.moments.list().then(setMoments).catch(() => {});
  }, []);

  const momentGroups = useMemo(() => {
    const map = new Map();
    for (const m of moments) {
      if (!map.has(m.author_id)) {
        map.set(m.author_id, { author: { id: m.author_id, handle: m.handle, name: m.name, palette: m.author_palette, avatarUrl: m.author_avatar_url }, items: [] });
      }
      map.get(m.author_id).items.push(m);
    }
    const groups = [...map.values()];
    groups.sort((a, b) => {
      if (a.author.id === me?.id) return -1;
      if (b.author.id === me?.id) return 1;
      const aUnseen = a.items.some(i => !i.viewed);
      const bUnseen = b.items.some(i => !i.viewed);
      return aUnseen === bUnseen ? 0 : aUnseen ? -1 : 1;
    });
    return groups;
  }, [moments, me?.id]);

  const myMomentGroup = momentGroups.find(g => g.author.id === me?.id) || null;

  const publishMoment = async () => {
    setMomentBusy(true);
    try {
      let mediaUrl = null;
      if (momentFile) mediaUrl = await api.upload(momentFile);
      await api.moments.create({ mediaUrl, palette: momentPalette });
      setMomentComposer(false); setMomentFile(null); setMomentPalette(0);
      loadMoments();
      ping('Momento publicado. Fica visível 24 horas.');
    } catch (e) { ping(e.message); }
    finally { setMomentBusy(false); }
  };

  const viewMoment = (id) => { api.moments.view(id).catch(() => {}); setMoments(ms => ms.map(m => m.id === id ? { ...m, viewed: true } : m)); };

  const deleteMoment = async (id) => {
    try {
      await api.moments.remove(id);
      const remaining = moments.filter(m => m.id !== id);
      setMoments(remaining);
      if (!remaining.some(m => m.author_id === viewingAuthor)) setViewingAuthor(null);
      ping('Momento apagado');
    } catch (e) { ping(e.message); }
  };

  const replyToMoment = async (authorId, text) => {
    try {
      const t = await api.messages.openThread(authorId);
      await api.messages.send(t.id, { kind: 'text', mode: 'normal', body: text });
      ping('Resposta enviada');
    } catch (e) { ping(e.message); }
  };

  const loadFeed = useCallback(async () => {
    setLoadingFeed(true); setFeedErr(null);
    try { setFeed((await api.posts.feed()).posts); }
    catch (e) { setFeedErr(e); }
    finally { setLoadingFeed(false); }
  }, []);

  useEffect(() => {
    if (!pick) return;
    let current = true;
    api.invites.today(pick).then(r => { if (current) setInvite(r); }).catch(() => { if (current) setInvite(null); });
    api.invites.proposals(pick).then(r => { if (current) setPool(r.proposals); }).catch(() => { if (current) setPool([]); });
    return () => { current = false; };
  }, [pick]);

  useEffect(() => { if (tab === 'dms') api.messages.threads().then(setThreads).catch(() => {}); }, [tab]);
  useEffect(() => { if (tab === 'me') api.users.blocked().then(setBlocked).catch(() => {}); }, [tab]);
  useEffect(() => {
    if (!thread) return;
    let current = true;
    const load = () => api.messages.list(thread.id).then(r => { if (current) setMsgs(r); }).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => { current = false; clearInterval(t); };
  }, [thread]);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [msgs]);

  const logout = () => { api.auth.logout().catch(() => {}); setMe(null); setTab('feed'); };

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
    catch (e) { ping(e.message); api.invites.proposals(pick).then(r => setPool(r.proposals)).catch(() => {}); }
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
    try {
      const r = await api.reports.create({ targetType: type, targetId: id, reason: 'abuso' });
      ping(r.hidden ? 'Denunciado e escondido até ser revisto' : 'Denunciado. Obrigado.');
    } catch (e) { ping(e.code === 'duplicate' ? 'Já tinhas denunciado' : e.message); }
  };

  if (booting) return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
      <div className="d" style={{ fontSize: 34, opacity: .25 }}>Lumi<span className="it">na</span></div>
    </div>
  );

  if (!me) return <Entrada onIn={afterLogin} />;
  if (showWelcome) return <Welcome onContinue={() => setShowWelcome(false)} />;
  if (milestone) return <Marco milestone={milestone} onContinue={() => setMilestone(null)} />;

  if (opening) return (
    <Abertura me={me} coms={coms} days={days}
      onSkip={() => setOpening(false)}
      onAnswer={(c) => { setOpening(false); setPick(c.id); setComp({ community: c.id, inviteId: c.invite_id, title: c.invite_text }); }}
      onCreateCommunity={() => { setOpening(false); setScreen('comunidades'); }} />
  );

  if (screen === 'seguranca') return <Seguranca onBack={() => setScreen(null)} ping={ping} />;
  if (screen === 'moderacao') return <Moderacao communities={coms} onBack={() => setScreen(null)} ping={ping} />;
  if (screen === 'TERMOS' || screen === 'PRIVACIDADE') return <Legal page={screen} onBack={() => setScreen(null)} />;
  if (screen === 'editar-perfil') return <EditarPerfil me={me} onSave={setMe} onBack={() => setScreen(null)} ping={ping} />;
  if (screen === 'amigos') return <Amigos onBack={() => setScreen(null)} ping={ping} />;
  if (screen === 'comunidades') return (
    <Comunidades mine={coms} ping={ping} onBack={() => setScreen(null)}
      onJoined={async () => {
        const c = await api.communities.mine().catch(() => coms);
        setComs(c);
        if (!pick && c[0]) setPick(c[0].id);
        setScreen(null);
        loadFeed();
      }} />
  );

  if (tab === 'dms' && thread) {
    const MODES = [['normal', MessageSquare, 'Normal'], ['timer', Timer, 'Efémera'], ['once', Eye, 'Uma vez']];
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--paper)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16 }}>
          <button className="p" onClick={() => setThread(null)} aria-label="Voltar às conversas" style={{ padding: 10 }}><ArrowLeft size={16} /></button>
          <Orb p={thread.palette} avatarUrl={thread.avatar_url} s={36} />
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

  if (tab === 'dms') return (
    <div style={{ minHeight: '100dvh', paddingBottom: 100, background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
      <div style={{ maxWidth: 460, margin: '0 auto', padding: 20 }}>
        <h2 className="d" style={{ fontSize: 42, margin: '10px 0 26px' }}>Conver<span className="it">sas</span></h2>
        {threads.length === 0 && <Empty>Ainda sem conversas.<br />Abre o perfil de alguém para falar.</Empty>}
        <div style={{ display: 'grid', gap: 11 }}>
          {threads.map((t, i) => (
            <button key={t.id} onClick={() => setThread({ id: t.id, name: t.name, handle: t.handle, palette: t.palette, avatar_url: t.avatar_url })}
              className="card in" style={{ border: 0, cursor: 'pointer', padding: 15, display: 'flex', gap: 13, alignItems: 'center', textAlign: 'left', animationDelay: `${i * 60}ms` }}>
              <Orb p={t.palette} avatarUrl={t.avatar_url} s={44} />
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
      <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} coms={coms} threads={threads} ping={ping} />
    </div>
  );

  if (tab === 'invites' && coms.length === 0) {
    return (
      <div style={{ minHeight: '100dvh', paddingBottom: 100, background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px' }}>
          <h2 className="d" style={{ fontSize: 42, margin: '10px 0 10px' }}>Con<span className="it">vites</span></h2>
          <Empty>
            Ainda não estás em nenhuma comunidade — por isso não há convite nenhum para mostrar.
            <button className="p p-cr" style={{ width: '100%', padding: 14, fontSize: 15, marginTop: 16 }}
              onClick={() => setScreen('comunidades')}>Criar ou entrar numa comunidade</button>
          </Empty>
        </div>
        <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} coms={coms} threads={threads} ping={ping} />
        <Toast text={toast} />
      </div>
    );
  }

  if (tab === 'invites') {
    const cur = coms.find(c => c.id === pick);
    const pickIdx = Math.max(0, coms.findIndex(c => c.id === pick));
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

          <div className="card in" key={pick} style={{ padding: 20, marginBottom: 12, background: PAL[pickIdx % 5].chip }}>
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
        <Composer comp={comp} setComp={setComp} coms={coms} file={file} setFile={setFile}
          palette={palette} setPalette={setPalette} body={body} setBody={setBody} busy={busy} publish={publish} />
        <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} coms={coms} threads={threads} ping={ping} />
        <Toast text={toast} />
      </div>
    );
  }

  if (tab === 'me') return (
    <div style={{ minHeight: '100dvh', paddingBottom: 100, background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
      <div style={{ maxWidth: 460, margin: '0 auto', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <Orb p={me.palette} avatarUrl={me.avatar_url} s={82} cls="float" />
          <button className="p" onClick={() => setScreen('editar-perfil')} style={{ marginTop: 4 }}>Editar perfil</button>
        </div>
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

        <button className="card" onClick={() => setScreen('amigos')}
          style={{ width: '100%', border: 0, cursor: 'pointer', padding: 18, textAlign: 'left', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <User size={17} color="var(--grey)" />
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>Amigos</span>
          <ArrowUpRight size={17} color="#ADA6CC" />
        </button>

        <button className="card" onClick={() => setScreen('comunidades')}
          style={{ width: '100%', border: 0, cursor: 'pointer', padding: 18, textAlign: 'left', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Users size={17} color="var(--grey)" />
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>Comunidades</span>
          <ArrowUpRight size={17} color="#ADA6CC" />
        </button>

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
      <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} coms={coms} threads={threads} ping={ping} />
      <Toast text={toast} />
    </div>
  );

  const main = coms.find(c => c.invite_id && !c.answered);

  return (
    <div style={{ minHeight: '100dvh', paddingBottom: 96 }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(239,237,251,.9)', backdropFilter: 'blur(14px)' }}>
        <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <h1 className="d" style={{ fontSize: 25, flex: 1 }}>Lumi<span className="it">na</span></h1>
          <button className="p" onClick={() => setScreen('amigos')} aria-label="Amigos" style={{ padding: 10 }}><Search size={16} /></button>
        </div>
      </header>

      <div className="ns" style={{ display: 'flex', gap: 16, overflowX: 'auto', padding: '4px 16px 16px' }}>
        <button onClick={() => myMomentGroup ? setViewingAuthor(me.id) : setMomentComposer(true)}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: 'none', border: 0, cursor: 'pointer', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <MomentRing palette={me.palette} avatarUrl={me.avatar_url} allSeen size={52} />
            {!myMomentGroup && (
              <span style={{ position: 'absolute', bottom: -1, right: -1, width: 19, height: 19, borderRadius: 99, background: 'var(--cobalt)', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 0 0 2px var(--paper)' }}>
                <Plus size={11} strokeWidth={3} />
              </span>
            )}
          </div>
          <span className="m">Tu</span>
        </button>
        {momentGroups.filter(g => g.author.id !== me.id).map(g => (
          <button key={g.author.id} onClick={() => setViewingAuthor(g.author.id)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: 'none', border: 0, cursor: 'pointer', flexShrink: 0, maxWidth: 60 }}>
            <MomentRing palette={g.author.palette} avatarUrl={g.author.avatarUrl} allSeen={g.items.every(i => i.viewed)} size={52} />
            <span className="m" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 58 }}>{g.author.name.split(' ')[0]}</span>
          </button>
        ))}
      </div>

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
                  <Orb p={p.author_palette} avatarUrl={p.author_avatar_url} s={38} />
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
                        <div className="card in" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 30, minWidth: 150, padding: 6, display: 'grid' }}>
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
                            <Orb p={c.palette} avatarUrl={c.avatar_url} s={26} />
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

      <Composer comp={comp} setComp={setComp} coms={coms} file={file} setFile={setFile}
        palette={palette} setPalette={setPalette} body={body} setBody={setBody} busy={busy} publish={publish} />
      <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} coms={coms} threads={threads} ping={ping} />
      <Toast text={toast} />

      {viewingAuthor && (() => {
        const group = momentGroups.find(g => g.author.id === viewingAuthor);
        if (!group) return null;
        const idx = momentGroups.indexOf(group);
        return (
          <MomentViewer group={group} meId={me.id}
            onView={viewMoment}
            onDelete={deleteMoment}
            onReply={replyToMoment}
            onClose={() => setViewingAuthor(null)}
            onNext={() => setViewingAuthor(momentGroups[idx + 1]?.author.id || null)}
            onPrev={() => setViewingAuthor(momentGroups[idx - 1]?.author.id || null)}
          />
        );
      })()}

      {momentComposer && (
        <MomentComposer
          file={momentFile} setFile={setMomentFile}
          palette={momentPalette} setPalette={setMomentPalette}
          busy={momentBusy}
          onClose={() => { setMomentComposer(false); setMomentFile(null); setMomentPalette(0); }}
          onPublish={publishMoment}
        />
      )}
    </div>
  );
}
