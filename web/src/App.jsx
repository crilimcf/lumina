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
import { Perfil } from './screens/Perfil.jsx';
import { Feed } from './screens/Feed.jsx';
import { Salas } from './screens/Salas.jsx';
import { Promocoes } from './screens/Promocoes.jsx';
import { Atividade } from './screens/Atividade.jsx';
import { useFeed } from './hooks/useFeed.js';
import { useMessages } from './hooks/useMessages.js';
import { useComposer } from './hooks/useComposer.js';
import { useMoments } from './hooks/useMoments.js';

const initialTab = () => {
  const requested = new URLSearchParams(window.location.search).get('tab');
  return ['feed','rooms','promos','alerts','dms','me'].includes(requested) ? requested : 'feed';
};

export default function App() {
  const [me, setMe] = useState(null);
  const [booting, setBooting] = useState(true);
  const [opening, setOpening] = useState(false);
  const [milestone, setMilestone] = useState(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [tab, setTab] = useState(initialTab);
  const [toast, setToast] = useState('');
  const [coms, setComs] = useState([]);
  const [days, setDays] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [screen, setScreen] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const ping = useCallback((text) => {
    setToast(text);
    setTimeout(() => setToast(''), 2600);
  }, []);

  const feedState = useFeed({ me, ping });
  const composerState = useComposer({ loadFeed: feedState.loadFeed, setComs, setDays, ping });
  const messageState = useMessages({ tab, palette: composerState.palette, ping });
  const momentState = useMoments({ me, ping });

  const meRef = useRef(null);
  useEffect(() => { meRef.current = me; }, [me]);

  useEffect(() => {
    onUnauthorized(() => {
      if (meRef.current) {
        setMe(null); setTab('feed'); setUnreadCount(0); messageState.setThread(null);
        ping('A sessão expirou. Entra outra vez.');
      }
    });
  }, [messageState.setThread, ping]);

  const refreshUnread = useCallback(() => {
    if (!meRef.current) return;
    api.notifications.unread().then(r => setUnreadCount(r.count || 0)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!me) return;
    refreshUnread();
    const id = setInterval(refreshUnread, 15_000);
    const onVisible = () => { if (document.visibilityState === 'visible') refreshUnread(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [me, refreshUnread]);

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
    setOpening(true);
    feedState.loadFeed();
    momentState.loadMoments();
    api.notifications.unread().then(r => setUnreadCount(r.count || 0)).catch(() => {});
  }

  useEffect(() => {
    (async () => {
      try { await afterLogin(await api.auth.me()); }
      catch { /* sem sessão */ }
      finally { setBooting(false); }
    })();
  }, []);

  useEffect(() => { if (tab === 'me') api.users.blocked().then(setBlocked).catch(() => {}); }, [tab]);
  useEffect(() => { if (tab === 'alerts') refreshUnread(); }, [tab, refreshUnread]);

  const report = async (type, id) => {
    try {
      const result = await api.reports.create({ targetType:type, targetId:id, reason:'abuso' });
      ping(result.hidden ? 'Denunciado e escondido até ser revisto' : 'Denunciado. Obrigado.');
    } catch (e) { ping(e.code === 'duplicate' ? 'Já tinhas denunciado' : e.message); }
  };
  const logout = () => { api.auth.logout().catch(()=>{}); setMe(null); setUnreadCount(0); setTab('feed'); messageState.setThread(null); };

  if (booting) return <div style={{minHeight:'100dvh',display:'grid',placeItems:'center'}}><div className="d" style={{fontSize:34,opacity:.25}}>Lumi<span className="it">na</span></div></div>;
  if (!me) return <Entrada onIn={afterLogin}/>;
  if (showWelcome) return <Welcome onContinue={()=>setShowWelcome(false)}/>;
  if (milestone) return <Marco milestone={milestone} onContinue={()=>setMilestone(null)}/>;
  if (opening) return <Abertura me={me} coms={coms} days={days} onSkip={()=>setOpening(false)} onRooms={()=>{setOpening(false);setTab('rooms')}} onCreateCommunity={()=>{setOpening(false);setScreen('comunidades')}}/>;

  if (screen==='seguranca') return <Seguranca onBack={()=>setScreen(null)} ping={ping}/>;
  if (screen==='moderacao') return <Moderacao communities={coms} onBack={()=>setScreen(null)} ping={ping}/>;
  if (screen==='TERMOS'||screen==='PRIVACIDADE') return <Legal page={screen} onBack={()=>setScreen(null)}/>;
  if (screen==='editar-perfil') return <EditarPerfil me={me} onSave={setMe} onBack={()=>setScreen(null)} ping={ping}/>;
  if (screen==='amigos') return <Amigos onBack={()=>setScreen(null)} ping={ping}/>;
  if (screen==='comunidades') return <Comunidades mine={coms} ping={ping} onBack={()=>setScreen(null)} onJoined={async()=>{
    const communities=await api.communities.mine().catch(()=>coms);setComs(communities);setScreen(null);feedState.loadFeed();
  }}/>;

  const { comp, ...composerWithoutComp } = composerState;
  const navProps = { tab,setTab,coms,setComp:composerState.setComp,threads:messageState.threads,setThread:messageState.setThread,ping,toast,unreadCount };
  let activeScreen;
  if (tab==='dms') activeScreen=<Conversas me={me} {...navProps} comp={comp} {...messageState}/>;
  else if (tab==='rooms') activeScreen=<Salas me={me} {...navProps}/>;
  else if (tab==='promos') activeScreen=<Promocoes {...navProps}/>;
  else if (tab==='alerts') activeScreen=<Atividade {...navProps} onUnreadChange={setUnreadCount}/>;
  else if (tab==='me') activeScreen=<Perfil me={me} coms={coms} setComs={setComs} days={days} blocked={blocked} setBlocked={setBlocked} setScreen={setScreen} logout={logout} tab={tab} setTab={setTab} setThread={messageState.setThread} setComp={composerState.setComp} threads={messageState.threads} ping={ping} toast={toast} unreadCount={unreadCount} onOpenCommunity={()=>setScreen('comunidades')}/>;
  else activeScreen=<Feed me={me} coms={coms} tab={tab} setTab={setTab} setScreen={setScreen} {...feedState} report={report} comp={null} {...composerWithoutComp} threads={messageState.threads} setThread={messageState.setThread} ping={ping} toast={toast} unreadCount={unreadCount} {...momentState}/>;

  return <>{activeScreen}<Composer comp={comp} setComp={composerState.setComp} coms={coms} file={composerState.file} setFile={composerState.setFile} palette={composerState.palette} setPalette={composerState.setPalette} body={composerState.body} setBody={composerState.setBody} busy={composerState.busy} publish={composerState.publish}/></>;
}
