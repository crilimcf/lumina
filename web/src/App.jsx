import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { api, onUnauthorized } from './api.js';
import { Composer } from './components/AppChrome.jsx';
import { Welcome } from './components/Milestones.jsx';
import { LaunchScreen } from './components/LaunchScreen.jsx';
import { IncomingCall } from './components/calls/IncomingCall.jsx';
import { CallOverlay } from './components/calls/CallOverlay.jsx';
import { Entrada } from './screens/Entrada.jsx';
import { Abertura } from './screens/Abertura.jsx';
import { useFeed } from './hooks/useFeed.js';
import { useMessages } from './hooks/useMessages.js';
import { useComposer } from './hooks/useComposer.js';
import { useMoments } from './hooks/useMoments.js';
import { useCalls } from './hooks/useCalls.js';
import { useSwipeNavigation } from './hooks/useSwipeNavigation.js';
import { exitNativeApp, takePendingNativeNavigation } from './native/runtime.js';
import { isNativeApp } from './native/session.js';
import './design-system-consolidation.css';
import './iphone-polish.css';
import './lumina-one-entry.css';

const namedLazy = (loader, name) => lazy(() => loader().then(module => ({ default:module[name] })));
const EditarPerfil = namedLazy(() => import('./screens/EditarPerfil.jsx'), 'EditarPerfil');
const Amigos = namedLazy(() => import('./screens/Amigos.jsx'), 'Amigos');
const PublicProfile = namedLazy(() => import('./screens/PublicProfile.jsx'), 'PublicProfile');
const Conversas = namedLazy(() => import('./screens/Conversas.jsx'), 'Conversas');
const Perfil = namedLazy(() => import('./screens/Perfil.jsx'), 'Perfil');
const Feed = namedLazy(() => import('./screens/Feed.jsx'), 'Feed');
const Salas = namedLazy(() => import('./screens/Salas.jsx'), 'Salas');
const Promocoes = namedLazy(() => import('./screens/Promocoes.jsx'), 'Promocoes');
const RadarAdmin = namedLazy(() => import('./screens/RadarAdmin.jsx'), 'RadarAdmin');
const Atividade = namedLazy(() => import('./screens/Atividade.jsx'), 'Atividade');
const LiveStudio = namedLazy(() => import('./screens/LiveStudio.jsx'), 'LiveStudio');
const LiveViewer = namedLazy(() => import('./screens/LiveViewer.jsx'), 'LiveViewer');
const LuminaOne = namedLazy(() => import('./screens/LuminaOne.jsx'), 'LuminaOne');
const Seguranca = namedLazy(() => import('./Seguranca.jsx'), 'Seguranca');
const Moderacao = namedLazy(() => import('./Seguranca.jsx'), 'Moderacao');
const Legal = namedLazy(() => import('./Seguranca.jsx'), 'Legal');

const initialTab = () => {
  const requested = new URLSearchParams(window.location.search).get('tab');
  return ['feed','rooms','promos','alerts','dms','me'].includes(requested) ? requested : 'feed';
};

const ScreenFallback = () => <div style={{minHeight:'78dvh',display:'grid',placeItems:'center'}}><div className="d" style={{fontSize:26,opacity:.24}}>Lumi<span className="it">na</span></div></div>;
const LegacySurface = ({ kind, children }) => <div className={`lumina-consolidated lumina-legacy-${kind}`}>{children}</div>;

const syncAppBadge = async (count) => {
  const value = Math.max(0, Number(count) || 0);
  try {
    if (value > 0 && 'setAppBadge' in navigator) await navigator.setAppBadge(Math.min(999, Math.floor(value)));
    else if (value === 0 && 'clearAppBadge' in navigator) await navigator.clearAppBadge();
  } catch {}
};

export default function App() {
  const [me, setMe] = useState(null);
  const [booting, setBooting] = useState(true);
  const [launchReady, setLaunchReady] = useState(false);
  const [opening, setOpening] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [tab, setTab] = useState(initialTab);
  const [toast, setToast] = useState('');
  const [blocked, setBlocked] = useState([]);
  const [screen, setScreen] = useState(null);
  const [profileHandle, setProfileHandle] = useState(null);
  const [liveId, setLiveId] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const applyNativeNavigation = useCallback((value) => {
    if (!value) return;
    const url = new URL(value, window.location.href);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    if (!meRef.current) return;
    const requestedLive = url.searchParams.get('live');
    if (requestedLive) {
      setLiveId(requestedLive);
      setScreen('live-viewer');
    } else if (url.searchParams.get('one')) {
      setScreen('one');
    } else {
      const requestedTab = url.searchParams.get('tab');
      if (['feed','rooms','promos','alerts','dms','me'].includes(requestedTab)) setTab(requestedTab);
      setScreen(null);
    }
    setOpening(false);
    setShowWelcome(false);
  }, []);

  const ping = useCallback((text) => {
    setToast(text);
    setTimeout(() => setToast(''), 2600);
  }, []);

  const feedState = useFeed({ me, ping });
  const composerState = useComposer({ loadFeed:feedState.loadFeed, ping });
  const messageState = useMessages({ tab, palette:composerState.palette, ping, enabled:!!me });
  const momentState = useMoments({ me, ping });
  const callState = useCalls({ enabled:!!me, ping });

  useEffect(() => {
    if (!isNativeApp) return;
    const pending = takePendingNativeNavigation();
    if (pending) applyNativeNavigation(pending);
    const navigate = event => applyNativeNavigation(event.detail?.url);
    window.addEventListener('lumina:native-navigation', navigate);
    return () => window.removeEventListener('lumina:native-navigation', navigate);
  }, [applyNativeNavigation]);

  useEffect(() => {
    if (!isNativeApp) return;
    const back = () => {
      window.__luminaNativeHaptic?.();
      if (callState.activeCall) return callState.closeActiveCall();
      if (composerState.comp) return composerState.setComp(null);
      if (messageState.thread) return messageState.setThread(null);
      if (screen) {
        setProfileHandle(null);
        setLiveId(null);
        return setScreen(null);
      }
      if (tab !== 'feed') return setTab('feed');
      void exitNativeApp();
    };
    window.addEventListener('lumina:native-back', back);
    return () => window.removeEventListener('lumina:native-back', back);
  }, [callState.activeCall, callState.closeActiveCall, composerState.comp, composerState.setComp, messageState.thread, messageState.setThread, screen, tab]);

  useSwipeNavigation({
    enabled: !!me && !opening && !showWelcome && !screen && !composerState.comp && !callState.activeCall && !callState.incoming,
    tab,
    setTab,
    thread:messageState.thread,
    setThread:messageState.setThread,
  });

  const meRef = useRef(null);
  useEffect(() => { meRef.current = me; }, [me]);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const timer = setTimeout(() => setLaunchReady(true), reduced ? 120 : 2300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    onUnauthorized(() => {
      if (meRef.current) {
        setMe(null);
        setTab('feed');
        setUnreadCount(0);
        setProfileHandle(null);
        setLiveId(null);
        setScreen(null);
        messageState.setThread(null);
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
    const id = setInterval(refreshUnread, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') refreshUnread(); };
    const onNotificationsChanged = () => refreshUnread();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('lumina:notifications-changed', onNotificationsChanged);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('lumina:notifications-changed', onNotificationsChanged);
    };
  }, [me, refreshUnread]);

  useEffect(() => { syncAppBadge(me ? unreadCount : 0); }, [me, unreadCount]);

  useEffect(() => {
    if (!me) return;
    const url = new URL(window.location.href);
    const notificationId = url.searchParams.get('notification');
    if (!notificationId) return;
    let alive = true;
    api.notifications.read(notificationId).catch(() => {}).finally(() => {
      if (!alive) return;
      url.searchParams.delete('notification');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
      refreshUnread();
    });
    return () => { alive = false; };
  }, [me, refreshUnread]);

  useEffect(() => {
    if (!me) return;
    const url = new URL(window.location.href);
    const requestedLive = url.searchParams.get('live');
    if (!requestedLive) return;
    setLiveId(requestedLive);
    setScreen('live-viewer');
    setOpening(false);
    setShowWelcome(false);
  }, [me]);

  useEffect(() => {
    if (!me) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.get('one')) return;
    setScreen('one');
    setOpening(false);
    setShowWelcome(false);
  }, [me]);

  useEffect(() => {
    if (!me) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.get('security')) return;
    setScreen('seguranca');
    setOpening(false);
    setShowWelcome(false);
  }, [me]);

  async function afterLogin(user, isNewAccount = false) {
    setMe(user);
    if (isNewAccount) setShowWelcome(true);
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

  const logout = async () => {
    try {
      await window.__luminaDisablePush?.();
      await api.auth.logout();
    } catch {}
    finally {
      setMe(null);
      setUnreadCount(0);
      setProfileHandle(null);
      setLiveId(null);
      setScreen(null);
      setTab('feed');
      messageState.setThread(null);
    }
  };

  const openProfile = useCallback((personOrHandle) => {
    const handle = typeof personOrHandle === 'string' ? personOrHandle : personOrHandle?.handle;
    if (!handle || handle === meRef.current?.handle) return;
    setProfileHandle(handle);
    setScreen('public-profile');
  }, []);

  const messageFromProfile = useCallback(async (person) => {
    await messageState.openContact(person);
    setScreen(null);
    setProfileHandle(null);
    setTab('dms');
  }, [messageState.openContact]);

  const openLive = useCallback((id) => {
    if (!id) return;
    setLiveId(id);
    setScreen('live-viewer');
  }, []);

  const closeLive = useCallback(() => {
    setLiveId(null);
    setScreen(null);
    setTab('feed');
    feedState.loadFeed();
  }, [feedState.loadFeed]);

  const closeOne = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('one');
    url.searchParams.delete('id');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    setScreen(null);
    setTab('feed');
  }, []);

  const withCalls = (content) => <>
    <Suspense fallback={<ScreenFallback/>}>{content}</Suspense>
    {callState.incoming && !callState.activeCall && <IncomingCall call={callState.incoming} busy={callState.busy} onAccept={callState.acceptIncoming} onDecline={callState.declineIncoming}/>} 
    {callState.activeCall && <CallOverlay {...callState.activeCall} ping={ping} onClosed={callState.closeActiveCall}/>} 
  </>;

  if (booting || !launchReady) return <LaunchScreen/>;
  if (!me) return <Entrada onIn={afterLogin}/>;
  if (showWelcome) return withCalls(<LegacySurface kind="welcome"><Welcome onContinue={()=>setShowWelcome(false)}/></LegacySurface>);
  if (opening) return withCalls(<Abertura me={me} onSkip={()=>setOpening(false)} onRooms={()=>{setOpening(false);setTab('rooms')}}/>);

  if (screen==='live-studio') return withCalls(<LiveStudio me={me} onBack={closeLive} ping={ping}/>);
  if (screen==='live-viewer' && liveId) return withCalls(<LiveViewer streamId={liveId} onBack={closeLive} ping={ping}/>);
  if (screen==='one') return withCalls(<LuminaOne me={me} onBack={closeOne} ping={ping} onOpenLive={openLive}/>);
  if (screen==='seguranca') return withCalls(<LegacySurface kind="security"><Seguranca onBack={()=>setScreen(null)} ping={ping}/></LegacySurface>);
  if (screen==='moderacao') return withCalls(<LegacySurface kind="moderation"><Moderacao onBack={()=>setScreen(null)} ping={ping}/></LegacySurface>);
  if (screen==='radar-admin' && me.is_staff) return withCalls(<LegacySurface kind="radar-admin"><RadarAdmin onBack={()=>setScreen(null)} ping={ping}/></LegacySurface>);
  if (screen==='TERMOS'||screen==='PRIVACIDADE') return withCalls(<LegacySurface kind="legal"><Legal page={screen} onBack={()=>setScreen(null)}/></LegacySurface>);
  if (screen==='editar-perfil') return withCalls(<LegacySurface kind="edit-profile"><EditarPerfil me={me} onSave={setMe} onBack={()=>setScreen(null)} ping={ping}/></LegacySurface>);
  if (screen==='amigos') return withCalls(<Amigos onBack={()=>setScreen(null)} ping={ping} onOpenProfile={openProfile}/>);
  if (screen==='public-profile' && profileHandle) return withCalls(<PublicProfile handle={profileHandle} onBack={()=>{setProfileHandle(null);setScreen(null)}} onMessage={messageFromProfile} ping={ping}/>);

  const { comp, ...composerWithoutComp } = composerState;
  const navProps = {
    tab,
    setTab,
    setComp:composerState.setComp,
    threads:messageState.threads,
    setThread:messageState.setThread,
    ping,
    toast,
    unreadCount,
  };

  let activeScreen;
  if (tab==='dms') activeScreen=<Conversas me={me} {...navProps} comp={comp} {...messageState} startCall={callState.startCall} callBusy={callState.busy}/>;
  else if (tab==='rooms') activeScreen=<Salas me={me} {...navProps}/>;
  else if (tab==='promos') activeScreen=<Promocoes me={me} setScreen={setScreen} {...navProps}/>;
  else if (tab==='alerts') activeScreen=<Atividade {...navProps} onUnreadChange={setUnreadCount} onOpenLive={openLive}/>;
  else if (tab==='me') activeScreen=<Perfil me={me} blocked={blocked} setBlocked={setBlocked} setScreen={setScreen} onOpenProfile={openProfile} logout={logout} tab={tab} setTab={setTab} setThread={messageState.setThread} setComp={composerState.setComp} threads={messageState.threads} ping={ping} toast={toast} unreadCount={unreadCount}/>;
  else activeScreen=<Feed me={me} tab={tab} setTab={setTab} setScreen={setScreen} {...feedState} report={report} comp={null} {...composerWithoutComp} threads={messageState.threads} setThread={messageState.setThread} ping={ping} toast={toast} unreadCount={unreadCount} {...momentState} onOpenLive={openLive}/>;

  return withCalls(<>
    {tab==='feed' && <button className="one-app-launch" onClick={()=>setScreen('one')} aria-label="Abrir Lumina One"><span className="one-app-launch-mark">✦</span><span>Lumina One</span><small>Pulso · Lumes · Cápsulas</small></button>}
    {activeScreen}
    <Composer
      comp={comp}
      setComp={composerState.setComp}
      file={composerState.file}
      setFile={composerState.setFile}
      body={composerState.body}
      setBody={composerState.setBody}
      busy={composerState.busy}
      publish={composerState.publish}
      onLive={()=>setScreen('live-studio')}
    />
  </>);
}
