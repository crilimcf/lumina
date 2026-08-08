import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, onUnauthorized } from './api.js';
import { Seguranca, Moderacao, Legal } from './Seguranca.jsx';
import { Marco, Welcome, checkMilestone } from './components/Milestones.jsx';
import { Entrada } from './screens/Entrada.jsx';
import { Abertura } from './screens/Abertura.jsx';
import { EditarPerfil } from './screens/EditarPerfil.jsx';
import { Amigos } from './screens/Amigos.jsx';
import { Comunidades } from './screens/Comunidades.jsx';
import { Conversas } from './screens/Conversas.jsx';
import { Convites } from './screens/Convites.jsx';
import { Perfil } from './screens/Perfil.jsx';
import { Feed } from './screens/Feed.jsx';
import { useFeed } from './hooks/useFeed.js';
import { useInvites } from './hooks/useInvites.js';
import { useMessages } from './hooks/useMessages.js';

/**
 * Orquestrador da SPA. O estado e comportamento de Feed, Convites e Mensagens
 * vivem nos respetivos hooks; a apresentação vive nos respetivos screens.
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
  const [pick, setPick] = useState(null);

  const [comp, setComp] = useState(null);
  const [body, setBody] = useState('');
  const [palette, setPalette] = useState(0);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const [moments, setMoments] = useState([]);
  const [viewingAuthor, setViewingAuthor] = useState(null);
  const [momentComposer, setMomentComposer] = useState(false);
  const [momentFile, setMomentFile] = useState(null);
  const [momentPalette, setMomentPalette] = useState(0);
  const [momentBusy, setMomentBusy] = useState(false);

  const [blocked, setBlocked] = useState([]);
  const [screen, setScreen] = useState(null);

  const ping = useCallback((text) => {
    setToast(text);
    setTimeout(() => setToast(''), 2600);
  }, []);

  const feedState = useFeed({ me, ping });
  const inviteState = useInvites({ pick, ping });
  const messageState = useMessages({ tab, palette, ping });

  const meRef = useRef(null);
  useEffect(() => { meRef.current = me; }, [me]);

  useEffect(() => {
    onUnauthorized(() => {
      if (meRef.current) {
        setMe(null);
        setTab('feed');
        messageState.setThread(null);
        ping('A sessão expirou. Entra outra vez.');
      }
    });
  }, [messageState.setThread, ping]);

  const loadMoments = useCallback(() => {
    api.moments.list().then(setMoments).catch(() => {});
  }, []);

  async function afterLogin(user, isNewAccount = false) {
    setMe(user);
    if (isNewAccount) setShowWelcome(true);
    const [communities, answerDays] = await Promise.all([
      api.communities.mine().catch(() => []),
      api.account.days().catch(() => ({ days: [] })),
    ]);
    setComs(communities);
    setDays(answerDays.days || []);
    setMilestone(checkMilestone(answerDays.lifetime, user.id));
    setPick(communities[0]?.id || null);
    setOpening(true);
    feedState.loadFeed();
    loadMoments();
  }

  useEffect(() => {
    (async () => {
      try {
        const user = await api.auth.me();
        await afterLogin(user);
      } catch {
        // Sem sessão: permanece no ecrã de entrada.
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (tab === 'me') api.users.blocked().then(setBlocked).catch(() => {});
  }, [tab]);

  const momentGroups = useMemo(() => {
    const map = new Map();
    for (const moment of moments) {
      if (!map.has(moment.author_id)) {
        map.set(moment.author_id, {
          author: {
            id: moment.author_id,
            handle: moment.handle,
            name: moment.name,
            palette: moment.author_palette,
            avatarUrl: moment.author_avatar_url,
          },
          items: [],
        });
      }
      map.get(moment.author_id).items.push(moment);
    }
    const groups = [...map.values()];
    groups.sort((a, b) => {
      if (a.author.id === me?.id) return -1;
      if (b.author.id === me?.id) return 1;
      const aUnseen = a.items.some(item => !item.viewed);
      const bUnseen = b.items.some(item => !item.viewed);
      return aUnseen === bUnseen ? 0 : aUnseen ? -1 : 1;
    });
    return groups;
  }, [moments, me?.id]);

  const myMomentGroup = momentGroups.find(group => group.author.id === me?.id) || null;

  const publishMoment = async () => {
    setMomentBusy(true);
    try {
      let mediaUrl = null;
      if (momentFile) mediaUrl = await api.upload(momentFile);
      await api.moments.create({ mediaUrl, palette: momentPalette });
      setMomentComposer(false);
      setMomentFile(null);
      setMomentPalette(0);
      loadMoments();
      ping('Momento publicado. Fica visível 24 horas.');
    } catch (e) {
      ping(e.message);
    } finally {
      setMomentBusy(false);
    }
  };

  const viewMoment = (id) => {
    api.moments.view(id).catch(() => {});
    setMoments(current => current.map(m => m.id === id ? { ...m, viewed: true } : m));
  };

  const deleteMoment = async (id) => {
    try {
      await api.moments.remove(id);
      const remaining = moments.filter(m => m.id !== id);
      setMoments(remaining);
      if (!remaining.some(m => m.author_id === viewingAuthor)) setViewingAuthor(null);
      ping('Momento apagado');
    } catch (e) {
      ping(e.message);
    }
  };

  const replyToMoment = async (authorId, text) => {
    try {
      const thread = await api.messages.openThread(authorId);
      await api.messages.send(thread.id, { kind: 'text', mode: 'normal', body: text });
      ping('Resposta enviada');
    } catch (e) {
      ping(e.message);
    }
  };

  const publish = async () => {
    if (!body.trim() || busy || !comp) return;
    setBusy(true);
    try {
      let mediaUrl = null;
      if (file) mediaUrl = await api.upload(file);
      const answeringInvite = !!comp.inviteId;
      await api.posts.create({
        communityId: comp.community,
        body: body.trim(),
        mediaUrl,
        palette,
        inviteId: comp.inviteId || null,
      });
      setBody('');
      setFile(null);
      setComp(null);
      const [, communities, answerDays] = await Promise.all([
        feedState.loadFeed(),
        api.communities.mine(),
        api.account.days(),
      ]);
      setComs(communities);
      setDays(answerDays.days || []);
      ping(answeringInvite ? 'Respondeste. Vê as outras respostas.' : 'Publicado');
    } catch (e) {
      ping(e.message);
    } finally {
      setBusy(false);
    }
  };

  const report = async (type, id) => {
    try {
      const result = await api.reports.create({ targetType: type, targetId: id, reason: 'abuso' });
      ping(result.hidden ? 'Denunciado e escondido até ser revisto' : 'Denunciado. Obrigado.');
    } catch (e) {
      ping(e.code === 'duplicate' ? 'Já tinhas denunciado' : e.message);
    }
  };

  const logout = () => {
    api.auth.logout().catch(() => {});
    setMe(null);
    setTab('feed');
    messageState.setThread(null);
  };

  if (booting) {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
        <div className="d" style={{ fontSize: 34, opacity: .25 }}>Lumi<span className="it">na</span></div>
      </div>
    );
  }

  if (!me) return <Entrada onIn={afterLogin} />;
  if (showWelcome) return <Welcome onContinue={() => setShowWelcome(false)} />;
  if (milestone) return <Marco milestone={milestone} onContinue={() => setMilestone(null)} />;

  if (opening) {
    return (
      <Abertura me={me} coms={coms} days={days}
        onSkip={() => setOpening(false)}
        onAnswer={(community) => {
          setOpening(false);
          setPick(community.id);
          setComp({ community: community.id, inviteId: community.invite_id, title: community.invite_text });
        }}
        onCreateCommunity={() => { setOpening(false); setScreen('comunidades'); }} />
    );
  }

  if (screen === 'seguranca') return <Seguranca onBack={() => setScreen(null)} ping={ping} />;
  if (screen === 'moderacao') return <Moderacao communities={coms} onBack={() => setScreen(null)} ping={ping} />;
  if (screen === 'TERMOS' || screen === 'PRIVACIDADE') return <Legal page={screen} onBack={() => setScreen(null)} />;
  if (screen === 'editar-perfil') return <EditarPerfil me={me} onSave={setMe} onBack={() => setScreen(null)} ping={ping} />;
  if (screen === 'amigos') return <Amigos onBack={() => setScreen(null)} ping={ping} />;
  if (screen === 'comunidades') {
    return (
      <Comunidades mine={coms} ping={ping} onBack={() => setScreen(null)}
        onJoined={async () => {
          const communities = await api.communities.mine().catch(() => coms);
          setComs(communities);
          if (!pick && communities[0]) setPick(communities[0].id);
          setScreen(null);
          feedState.loadFeed();
        }} />
    );
  }

  if (tab === 'dms') {
    return (
      <Conversas me={me} tab={tab} setTab={setTab} coms={coms} comp={comp} setComp={setComp} ping={ping}
        {...messageState} />
    );
  }

  if (tab === 'invites') {
    return (
      <Convites tab={tab} setTab={setTab} coms={coms} pick={pick} setPick={setPick}
        pool={inviteState.pool} idea={inviteState.idea} setIdea={inviteState.setIdea}
        vote={inviteState.vote} propose={inviteState.propose} report={report}
        setScreen={setScreen} comp={comp} setComp={setComp} file={file} setFile={setFile}
        palette={palette} setPalette={setPalette} body={body} setBody={setBody}
        busy={busy} publish={publish} threads={messageState.threads} setThread={messageState.setThread}
        ping={ping} toast={toast} />
    );
  }

  if (tab === 'me') {
    return (
      <Perfil me={me} coms={coms} days={days} blocked={blocked} setBlocked={setBlocked}
        setScreen={setScreen} logout={logout} tab={tab} setTab={setTab}
        setThread={messageState.setThread} setComp={setComp} threads={messageState.threads}
        ping={ping} toast={toast} />
    );
  }

  return (
    <Feed me={me} coms={coms} tab={tab} setTab={setTab} setScreen={setScreen}
      {...feedState} report={report}
      comp={comp} setComp={setComp} file={file} setFile={setFile}
      palette={palette} setPalette={setPalette} body={body} setBody={setBody}
      busy={busy} publish={publish} threads={messageState.threads} setThread={messageState.setThread}
      ping={ping} toast={toast}
      momentGroups={momentGroups} myMomentGroup={myMomentGroup}
      viewingAuthor={viewingAuthor} setViewingAuthor={setViewingAuthor}
      viewMoment={viewMoment} deleteMoment={deleteMoment} replyToMoment={replyToMoment}
      momentComposer={momentComposer} setMomentComposer={setMomentComposer}
      momentFile={momentFile} setMomentFile={setMomentFile}
      momentPalette={momentPalette} setMomentPalette={setMomentPalette}
      momentBusy={momentBusy} publishMoment={publishMoment} />
  );
}
