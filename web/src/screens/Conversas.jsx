import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, BellOff, BellRing, Camera, CheckCircle2, Eye, MessageSquare, Phone, Pin, Search, Send, Sparkles, Timer, Video, X } from 'lucide-react';
import { api } from '../api.js';
import { Orb } from '../ui.jsx';
import { Bubble } from '../components/messages/Bubble.jsx';
import { ConversationContextMenu } from '../components/messages/ConversationContextMenu.jsx';
import { MediaEditor } from '../components/messages/MediaEditor.jsx';
import { Nav, TopActions } from '../components/AppChrome.jsx';
import { locale, t, translateDynamic } from '../i18n.js';
import '../messages-facelift.css';
import '../messages-context-menu.css';
import '../interaction-polish.css';

function PresenceAvatar({ person, size }) {
  return <span className="messages-avatar-halo">
    <Orb p={person.palette} avatarUrl={person.avatar_url} s={size}/>
    {!!person.online && <span className="messages-presence-dot" role="img" aria-label={t('Online')} title={t('Online')}/>}
  </span>;
}

export function Conversas({
  me, tab, setTab, setComp, unreadCount, threads, contacts = [], openContact, loadThreads, ping,
  thread, setThread, msgs, text, setText, mode, setMode,
  mediaDraft, mediaReady, chooseMedia, acceptMedia, clearMedia,
  sending, send, editMessage, removeMessage, end,
  startCall, callBusy,
}) {
  const availableContacts = useMemo(() => {
    const inThreads = new Set(threads.map(t => t.other_id));
    return contacts.filter(person => !inThreads.has(person.id));
  }, [contacts, threads]);

  const [query, setQuery] = useState('');
  const [inboxView, setInboxView] = useState('recent');
  const [contextThread, setContextThread] = useState(null);
  const [contextMessages, setContextMessages] = useState([]);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextBusy, setContextBusy] = useState('');
  const [callPush, setCallPush] = useState({ checking:true, supported:true, standalone:true, permission:'default', subscribed:false });
  const [callPushBusy, setCallPushBusy] = useState(false);
  const [visualFrame, setVisualFrame] = useState(null);
  const composerInputRef = useRef(null);
  const threadScrollRef = useRef(null);
  const longPressRef = useRef(null);
  const suppressClickRef = useRef(null);
  const contextRequestRef = useRef(0);

  const scrollThreadToEnd = useCallback(() => {
    const scroller = threadScrollRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, []);

  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const filteredThreads = useMemo(() => {
    if (!normalizedQuery) return threads;
    return threads.filter(item => `${item.name || ''} ${item.handle || ''} ${item.body || ''}`.toLocaleLowerCase(locale).includes(normalizedQuery));
  }, [normalizedQuery, threads]);
  const filteredContacts = useMemo(() => {
    if (!normalizedQuery) return availableContacts;
    return availableContacts.filter(item => `${item.name || ''} ${item.handle || ''}`.toLocaleLowerCase(locale).includes(normalizedQuery));
  }, [availableContacts, normalizedQuery]);
  const archivedCount = useMemo(() => threads.filter(item => item.archived).length, [threads]);
  const recentCount = threads.length - archivedCount;
  const visibleThreads = useMemo(() => filteredThreads.filter(item => inboxView === 'archived' ? item.archived : !item.archived), [filteredThreads, inboxView]);
  const visibleContacts = inboxView === 'recent' ? filteredContacts : [];

  useEffect(() => {
    if (inboxView === 'archived' && archivedCount === 0) setInboxView('recent');
  }, [archivedCount, inboxView]);

  useEffect(() => {
    if (!thread || !window.visualViewport) { setVisualFrame(null); return undefined; }
    const viewport = window.visualViewport;
    let raf = 0;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setVisualFrame({
          height:Math.max(1, Math.round(viewport.height)),
          top:Math.max(0, Math.round(viewport.offsetTop || 0)),
        });
        if (document.activeElement === composerInputRef.current) scrollThreadToEnd();
      });
    };
    sync();
    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);
    return () => {
      cancelAnimationFrame(raf);
      viewport.removeEventListener('resize', sync);
      viewport.removeEventListener('scroll', sync);
    };
  }, [thread?.id, scrollThreadToEnd]);

  useEffect(() => {
    if (!thread) return undefined;
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousScrollY = window.scrollY;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    if (previousScrollY) window.scrollTo(0, 0);
    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      if (previousScrollY) requestAnimationFrame(() => window.scrollTo(0, previousScrollY));
    };
  }, [thread?.id]);

  useEffect(() => {
    if (!contextThread) return undefined;
    const body = document.body;
    const previous = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => { body.style.overflow = previous; };
  }, [contextThread]);

  const refreshCallPush = useCallback(async () => {
    try {
      const snapshot = await window.__luminaPushSnapshot?.();
      if (snapshot) setCallPush({ checking:false, ...snapshot });
      else setCallPush(current => ({ ...current, checking:false }));
    } catch {
      setCallPush(current => ({ ...current, checking:false }));
    }
  }, []);

  useEffect(() => {
    refreshCallPush();
    window.addEventListener('lumina:push-state', refreshCallPush);
    window.addEventListener('focus', refreshCallPush);
    return () => {
      window.removeEventListener('lumina:push-state', refreshCallPush);
      window.removeEventListener('focus', refreshCallPush);
    };
  }, [refreshCallPush]);

  const enableCallsHere = useCallback(async () => {
    if (callPushBusy) return;
    setCallPushBusy(true);
    try { await window.__luminaEnablePush?.(); }
    finally { setCallPushBusy(false); await refreshCallPush(); }
  }, [callPushBusy, refreshCallPush]);

  const callPushReady = callPush.permission === 'granted' && callPush.subscribed;
  const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const callReadiness = (compact = false) => {
    if (callPush.checking) return null;
    if (callPushReady) {
      if (compact) return null;
      return <div className="messages-call-status is-ready">
        <span className="messages-call-status-icon"><CheckCircle2 size={17}/></span>
        <div className="messages-call-status-copy">
          <div className="messages-call-status-title">{t('Chamadas em segundo plano ativas')}</div>
          <div className="messages-call-status-detail">{t('A Lumina pode avisar-te quando este dispositivo estiver em segundo plano.')}</div>
        </div>
      </div>;
    }

    const notStandalone = isIos && !callPush.standalone;
    const denied = callPush.permission === 'denied';
    const unsupported = callPush.supported === false;
    const title = unsupported
      ? t('Este browser não permite chamadas em segundo plano')
      : notStandalone
        ? t('Instala a Lumina no ecrã principal para receber chamadas')
        : denied
          ? t('As notificações da Lumina estão bloqueadas neste dispositivo')
          : t('Ativa as chamadas neste dispositivo');
    const detail = unsupported
      ? t('Com a app aberta, as chamadas continuam disponíveis.')
      : notStandalone
        ? t('No iPhone, o aviso de chamada com a Lumina fechada precisa da web app no ecrã principal.')
        : denied
          ? t('Reativa as notificações da Lumina nas definições do dispositivo para receber chamadas quando a app não está aberta.')
          : t('Permite que uma chamada te avise mesmo quando a Lumina está em segundo plano.');
    const canEnable = !unsupported && !notStandalone && !denied;

    return <div className={`messages-call-status is-warning${compact ? ' is-compact' : ''}`}>
      <span className="messages-call-status-icon">{denied || unsupported ? <AlertTriangle size={17}/> : <BellRing size={17}/>}</span>
      <div className="messages-call-status-copy">
        <div className="messages-call-status-title">{title}</div>
        {!compact && <div className="messages-call-status-detail">{detail}</div>}
      </div>
      {canEnable && <button type="button" className="p p-sm p-brand" onClick={enableCallsHere} disabled={callPushBusy}>{callPushBusy ? t('A ativar…') : t('Ativar')}</button>}
    </div>;
  };

  const mediaPicker = (label) => <label className={`messages-media-picker${label ? ' has-label' : ''}`} data-swipe-ignore="true">
    <Camera size={17}/>{label && <span>{label}</span>}
    <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" hidden onChange={e=>{const file=e.target.files?.[0]||null;if(file)chooseMedia(file);e.target.value='';}}/>
  </label>;

  const closeThreadContext = useCallback(() => {
    contextRequestRef.current += 1;
    setContextThread(null);
    setContextMessages([]);
    setContextLoading(false);
    setContextBusy('');
  }, []);

  const openThreadContext = useCallback(async (item) => {
    if (!item?.id) return;
    const requestId = ++contextRequestRef.current;
    setContextThread(item);
    setContextMessages([]);
    setContextLoading(true);
    setContextBusy('');
    try { window.__luminaNativeHaptic?.(); } catch {}
    try {
      const payload = await api.messages.preview(item.id);
      if (contextRequestRef.current !== requestId) return;
      setContextMessages(Array.isArray(payload?.messages) ? payload.messages : []);
    } catch (error) {
      if (contextRequestRef.current !== requestId) return;
      ping?.(error.message || t('Não foi possível carregar a pré-visualização.'));
    } finally {
      if (contextRequestRef.current === requestId) setContextLoading(false);
    }
  }, [ping]);

  const handleThreadContextAction = useCallback(async (action) => {
    const item = contextThread;
    if (!item || contextBusy) return;
    if (action === 'block') {
      const confirmed = window.confirm(t('Bloquear {name}? Deixarão de poder trocar mensagens e chamadas.', { name:item.name }));
      if (!confirmed) return;
    }
    setContextBusy(action);
    try {
      if (action === 'unread') await api.messages.preferences(item.id, { markedUnread:true });
      else if (action === 'pin') await api.messages.preferences(item.id, { pinned:!item.pinned });
      else if (action === 'mute') await api.messages.preferences(item.id, { muted:!item.muted });
      else if (action === 'archive') await api.messages.preferences(item.id, { archived:!item.archived });
      else if (action === 'block') await api.users.block(item.other_id);
      else return;

      await loadThreads?.({ announce:false });
      if (action === 'unread') ping?.(t('Conversa marcada como não lida.'));
      else if (action === 'pin') ping?.(item.pinned ? t('Conversa desafixada.') : t('Conversa afixada.'));
      else if (action === 'mute') ping?.(item.muted ? t('Som da conversa reativado.') : t('Conversa silenciada.'));
      else if (action === 'archive') ping?.(item.archived ? t('Conversa desarquivada.') : t('Conversa arquivada.'));
      else if (action === 'block') ping?.(t('{name} foi bloqueado.', { name:item.name }));
      closeThreadContext();
    } catch (error) {
      ping?.(error.message || t('Não foi possível alterar a conversa.'));
      setContextBusy('');
    }
  }, [closeThreadContext, contextBusy, contextThread, loadThreads, ping]);

  const cancelLongPress = useCallback(() => {
    if (longPressRef.current?.timer) window.clearTimeout(longPressRef.current.timer);
    longPressRef.current = null;
  }, []);

  const startLongPress = useCallback((event, item) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    cancelLongPress();
    const state = { pointerId:event.pointerId, x:event.clientX, y:event.clientY, itemId:item.id, timer:null };
    state.timer = window.setTimeout(() => {
      suppressClickRef.current = { id:item.id, until:Date.now() + 900 };
      longPressRef.current = null;
      void openThreadContext(item);
    }, 430);
    longPressRef.current = state;
  }, [cancelLongPress, openThreadContext]);

  const moveLongPress = useCallback((event) => {
    const state = longPressRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - state.x, event.clientY - state.y) > 12) cancelLongPress();
  }, [cancelLongPress]);

  const openConversation = useCallback((item) => {
    const suppressed = suppressClickRef.current;
    if (suppressed?.id === item.id && Date.now() < suppressed.until) {
      suppressClickRef.current = null;
      return;
    }
    suppressClickRef.current = null;
    setThread({id:item.id,name:item.name,handle:item.handle,palette:item.palette,avatar_url:item.avatar_url,other_id:item.other_id,online:!!item.online});
  }, [setThread]);

  const focusComposer = () => {
    requestAnimationFrame(() => {
      scrollThreadToEnd();
      requestAnimationFrame(scrollThreadToEnd);
    });
  };

  const keepComposerFocused = event => {
    if (document.activeElement === composerInputRef.current) event.preventDefault();
  };

  const sendWithComposerFocus = () => {
    void send();
    requestAnimationFrame(() => {
      composerInputRef.current?.focus?.({ preventScroll:true });
      scrollThreadToEnd();
    });
  };

  const sendOnEnter = event => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    sendWithComposerFocus();
  };

  if (thread) {
    const modes = [['normal',MessageSquare,t('Normal')],['timer',Timer,t('Efémera')],['once',Eye,t('Uma vez')]];
    const viewportStyle = visualFrame
      ? { height:`${visualFrame.height}px`, top:`${visualFrame.top}px` }
      : { height:'100dvh', top:0 };
    return <div className="lumina-facelift lumina-messages lumina-messages-thread messages-visual-viewport" style={viewportStyle}>
      <header className="messages-thread-header">
        <button className="messages-thread-back" onClick={()=>setThread(null)} aria-label={t('Voltar às conversas')}><ArrowLeft size={18}/></button>
        <div className="messages-thread-identity">
          <PresenceAvatar person={thread} size={36}/>
          <div className="messages-thread-identity-copy">
            <div className="messages-thread-identity-name">{thread.name}</div>
            <div className="messages-thread-identity-handle">@{thread.handle}</div>
          </div>
        </div>
        <button className="messages-thread-call" onClick={()=>startCall?.(thread,'audio')} disabled={callBusy} aria-label={translateDynamic(`Ligar por áudio a ${thread.name}`)}><Phone size={17}/></button>
        <button className="messages-thread-call" onClick={()=>startCall?.(thread,'video')} disabled={callBusy} aria-label={translateDynamic(`Fazer videochamada com ${thread.name}`)}><Video size={18}/></button>
      </header>
      {callReadiness(true)}
      <div ref={threadScrollRef} className="ns messages-thread-scroll">
        {msgs.length === 0 && <div className="messages-thread-empty">{t('Diz olá e começa uma conversa.')}</div>}
        {msgs.map(message => <Bubble key={message.id} msg={message} mine={message.sender_id===me.id} onReveal={api.messages.reveal} onEdit={editMessage} onDelete={removeMessage}/>)}
        <div ref={end}/>
      </div>
      <div className="messages-composer-shell">
        <div className="ns messages-mode-row">{modes.map(([key,Icon,label])=><button key={key} onClick={()=>setMode(key)} className={`messages-mode-chip${mode===key?' is-active':''}`}><Icon size={13}/>{label}</button>)}</div>
        {mode!=='normal' && <p className="messages-mode-hint">{mode==='timer'?t('Apaga-se pouco depois de ser aberta. Não impedimos capturas de ecrã.'):t('Foto ou vídeo abre uma vez e não volta. Não impedimos capturas de ecrã.')}</p>}
        {mediaReady && mode!=='timer' && <div className="messages-media-ready">
          <span>{mediaReady.type==='video'?'🎥':'📷'}</span>
          <span className="messages-media-ready-name">{mediaReady.file.name}</span>
          <button className="messages-media-remove" onClick={clearMedia} aria-label={t('Remover ficheiro')}><X size={15}/></button>
        </div>}
        {mode==='once' ? <div className="messages-once-stack">
          {!mediaReady && mediaPicker(t('Escolher foto ou vídeo'))}
          <button className="messages-once-send" onClick={send} disabled={!mediaReady||sending} aria-label={t('Enviar uma vez')}>{sending?t('A enviar…'):`${t('Enviar')} ${t(mediaReady?.type==='video'?'vídeo':'foto')} · ${t('Uma vez').toLocaleLowerCase(locale)}`}</button>
        </div> : mode==='timer' ? <div className="messages-composer-row">
          <input ref={composerInputRef} className="messages-composer-input" value={text} onChange={e=>setText(e.target.value)} onFocus={focusComposer} onKeyDown={sendOnEnter} placeholder={t('Mensagem efémera…')}/>
          <button className="messages-send-button" onPointerDown={keepComposerFocused} onClick={sendWithComposerFocus} disabled={sending||!text.trim()} aria-label={t('Enviar mensagem')}><Send size={17}/></button>
        </div> : <div className="messages-composer-row">
          {!mediaReady && mediaPicker('')}
          <input ref={composerInputRef} className="messages-composer-input" value={text} disabled={!!mediaReady} onChange={e=>setText(e.target.value)} onFocus={focusComposer} onKeyDown={sendOnEnter} placeholder={mediaReady?t('Media pronta para enviar'):t('Escrever…')}/>
          <button className="messages-send-button" onPointerDown={keepComposerFocused} onClick={sendWithComposerFocus} disabled={sending||(!text.trim()&&!mediaReady)} aria-label={t('Enviar')}><Send size={17}/></button>
        </div>}
      </div>
      {mediaDraft && <MediaEditor file={mediaDraft} onCancel={clearMedia} onReady={acceptMedia}/>} 
    </div>;
  }

  const hasAnyPeople = threads.length > 0 || availableContacts.length > 0;
  const hasViewResults = visibleThreads.length > 0 || visibleContacts.length > 0;

  return <div className="lumina-facelift lumina-messages lumina-messages-inbox">
    <div className="messages-inbox-shell">
      <header className="messages-inbox-header">
        <div className="messages-title-row">
          <div className="messages-title-copy">
            <div className="messages-eyebrow">Lumina Direct</div>
            <h1>{t('Conversas')}</h1>
            <p>{t('As tuas ligações, mensagens e chamadas num espaço mais íntimo.')}</p>
          </div>
          <TopActions tab={tab} setTab={setTab} setThread={setThread} unreadCount={unreadCount}/>
        </div>
        <label className="messages-search">
          <Search size={17}/>
          <input value={query} onChange={event=>setQuery(event.target.value)} placeholder={t('Pesquisar conversas e pessoas')} aria-label={t('Pesquisar conversas e pessoas')}/>
        </label>
      </header>

      {callReadiness(false)}

      {archivedCount > 0 && <div className="messages-inbox-filters" role="group" aria-label={t('Filtrar conversas')}>
        <button type="button" className={`messages-inbox-filter${inboxView==='recent'?' is-active':''}`} onClick={()=>setInboxView('recent')}>{t('Recentes')} · {recentCount}</button>
        <button type="button" className={`messages-inbox-filter${inboxView==='archived'?' is-active':''}`} onClick={()=>setInboxView('archived')}>{t('Arquivadas')} · {archivedCount}</button>
      </div>}

      {!hasAnyPeople && <div className="messages-empty">
        <span className="messages-empty-icon"><Sparkles size={22}/></span>
        <strong>{t('As conversas começam nas conexões.')}</strong>
        <p>{t('Segue alguém ou aceita um seguidor para começares a trocar mensagens na Lumina.')}</p>
      </div>}

      {hasAnyPeople && normalizedQuery && !hasViewResults && <div className="messages-no-results">{t('Não encontrámos conversas ou pessoas para “{query}”.', { query:query.trim() })}</div>}
      {hasAnyPeople && !normalizedQuery && !hasViewResults && <div className="messages-no-results">{inboxView==='archived' ? t('Não tens conversas arquivadas.') : t('Não tens conversas recentes.')}</div>}

      {visibleThreads.length > 0 && <section className="messages-section" aria-label={inboxView==='archived'?t('Conversas arquivadas'):t('Conversas recentes')}>
        <div className="messages-section-head"><strong>{inboxView==='archived'?t('Arquivadas'):t('Recentes')}</strong><span>{visibleThreads.length} {visibleThreads.length===1?t('conversa'):t('conversas')}</span></div>
        <div className="messages-thread-list">{visibleThreads.map((item,index)=><button
          key={item.id}
          type="button"
          aria-label={translateDynamic(`Abrir conversa com ${item.name}`)}
          onPointerDown={event=>startLongPress(event,item)}
          onPointerMove={moveLongPress}
          onPointerUp={cancelLongPress}
          onPointerCancel={cancelLongPress}
          onPointerLeave={cancelLongPress}
          onContextMenu={event=>{event.preventDefault();suppressClickRef.current={id:item.id,until:Date.now()+350};void openThreadContext(item);}}
          onClick={()=>openConversation(item)}
          className={`messages-thread-card in${item.unread>0?' has-unread':''}`}
          style={{animationDelay:`${Math.min(index,8)*45}ms`}}
        >
          <PresenceAvatar person={item} size={46}/>
          <span className="messages-thread-body">
            <span className="messages-thread-topline">
              <span className="messages-thread-name">{item.name}</span>
              <span className="messages-thread-handle">@{item.handle}</span>
              {(item.pinned || item.muted) && <span className="messages-thread-flags" aria-hidden="true">
                {item.pinned && <span className="messages-thread-flag"><Pin size={11}/></span>}
                {item.muted && <span className="messages-thread-flag"><BellOff size={11}/></span>}
              </span>}
            </span>
            <span className="messages-thread-preview">{item.body||t('Toca para conversar')}</span>
          </span>
          {item.unread>0 && <span className="messages-unread" aria-label={translateDynamic(`${item.unread} por ler`)}>{item.unread>9?'9+':item.unread}</span>}
        </button>)}</div>
      </section>}

      {visibleContacts.length > 0 && <section className="messages-section" aria-label={t('Pessoas disponíveis')}>
        <div className="messages-section-head"><strong>{t('Começar uma conversa')}</strong><span>{t('Conexões')}</span></div>
        <div className="messages-contact-list">{visibleContacts.map((person,index)=><button
          key={person.id}
          type="button"
          aria-label={translateDynamic(`Conversar com ${person.name}`)}
          onClick={()=>openContact?.(person)}
          className="messages-contact-card in"
          style={{animationDelay:`${Math.min(index,8)*40}ms`}}
        >
          <PresenceAvatar person={person} size={42}/>
          <span className="messages-contact-meta">
            <span className="messages-contact-name">{person.name}</span>
            <span className="messages-contact-handle">@{person.handle}{person.following&&person.follows_me?` · ${t('seguem-se')}`:person.follows_me?` · ${t('segue-te')}`:` · ${t('a seguir')}`}</span>
          </span>
          <span className="messages-contact-action"><MessageSquare size={16}/></span>
        </button>)}</div>
      </section>}
    </div>

    <ConversationContextMenu
      item={contextThread}
      me={me}
      messages={contextMessages}
      loading={contextLoading}
      busyAction={contextBusy}
      onClose={closeThreadContext}
      onAction={handleThreadContextAction}
    />

    <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} threads={threads}/>
  </div>;
}