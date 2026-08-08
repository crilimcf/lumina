import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, onUnauthorized } from './api.js';
import { Seguranca, Moderacao, Legal } from './Seguranca.jsx';
import { Composer } from './components/AppChrome.jsx';
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
import { useComposer } from './hooks/useComposer.js';
import { useMoments } from './hooks/useMoments.js';

/**
 * Orquestrador da SPA. Estado e comportamento de domínio vivem nos hooks;
 * apresentação vive nos screens. App decide apenas que fluxo/ecrã está ativo.
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
  const [blocked, setBlocked] = useState([]);
  const [screen, setScreen] = useState(null);

  const ping = useCallback((text) => {
    setToast(text);
    setTimeout(() => setToast(''), 2600);
  }, []);

  const feedState = useFeed({ me, ping });
  const composerState = useComposer({
    loadFeed: feedState.loadFeed,
    setComs,
    setDays,
    ping,
  });
  const inviteState = useInvites({ pick, ping });
  const messageState = useMessages({ tab, palette: composerState.palette, ping });
  const momentState = useMoments({ me, ping });

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
    momentState.loadMoments();
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
          composerState.setComp({
            community: community.id,
            inviteId: community.invite_id,
            title: community.invite_text,
          });
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

  // O composer de publicação pertence à shell principal, não a uma página.
  // Assim o botão + da navegação funciona de forma idêntica em Feed, Convites,
  // Conversas e Perfil. Feed/Convites recebem comp=null para manter os seus
  // composers antigos desmontados até os removermos numa limpeza posterior.
  const { comp, ...composerWithoutComp } = composerState;
  let activeScreen;

  if (tab === 'dms') {
    activeScreen = (
      <Conversas me={me} tab={tab} setTab={setTab} coms={coms}
        comp={comp} setComp={composerState.setComp} ping={ping}
        {...messageState} />
    );
  } else if (tab === 'invites') {
    activeScreen = (
      <Convites tab={tab} setTab={setTab} coms={coms} pick={pick} setPick={setPick}
        pool={inviteState.pool} idea={inviteState.idea} setIdea={inviteState.setIdea}
        vote={inviteState.vote} propose={inviteState.propose} report={report}
        setScreen={setScreen} comp={null} {...composerWithoutComp}
        threads={messageState.threads} setThread={messageState.setThread}
        ping={ping} toast={toast} />
    );
  } else if (tab === 'me') {
    activeScreen = (
      <Perfil me={me} coms={coms} setComs={setComs} days={days} blocked={blocked} setBlocked={setBlocked}
        setScreen={setScreen} logout={logout} tab={tab} setTab={setTab}
        setThread={messageState.setThread} setComp={composerState.setComp}
        threads={messageState.threads} ping={ping} toast={toast}
        onOpenCommunity={(communityId) => { setPick(communityId); setTab('invites'); }} />
    );
  } else {
    activeScreen = (
      <Feed me={me} coms={coms} tab={tab} setTab={setTab} setScreen={setScreen}
        {...feedState} report={report} comp={null} {...composerWithoutComp}
        threads={messageState.threads} setThread={messageState.setThread}
        ping={ping} toast={toast} {...momentState} />
    );
  }

  return (
    <>
      {activeScreen}
      <Composer comp={comp} setComp={composerState.setComp} coms={coms}
        file={composerState.file} setFile={composerState.setFile}
        palette={composerState.palette} setPalette={composerState.setPalette}
        body={composerState.body} setBody={composerState.setBody}
        busy={composerState.busy} publish={composerState.publish} />
    </>
  );
}
