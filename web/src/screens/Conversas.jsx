import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, BellRing, Camera, CheckCircle2, Eye, MessageSquare, Phone, Search, Send, Sparkles, Timer, Video, X } from 'lucide-react';
import { api } from '../api.js';
import { Orb } from '../ui.jsx';
import { Bubble } from '../components/messages/Bubble.jsx';
import { MediaEditor } from '../components/messages/MediaEditor.jsx';
import { Nav, TopActions } from '../components/AppChrome.jsx';
import { locale, t, translateDynamic } from '../i18n.js';
import '../messages-facelift.css';
import '../interaction-polish.css';

function PresenceAvatar({ person, size }) {
  return <span className="messages-avatar-halo">
    <Orb p={person.palette} avatarUrl={person.avatar_url} s={size}/>
    {!!person.online && <span className="messages-presence-dot" role="img" aria-label={t('Online')} title={t('Online')}/>}
  </span>;
}

export function Conversas({
  me, tab, setTab, setComp, unreadCount, threads, contacts = [], openContact,
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
  const [callPush, setCallPush] = useState({ checking:true, supported:true, standalone:true, permission:'default', subscribed:false });
  const [callPushBusy, setCallPushBusy] = useState(false);
  const [visualFrame, setVisualFrame] = useState(null);
  const composerInputRef = useRef(null);
  const threadScrollRef = useRef(null);

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
  const hasSearchResults = filteredThreads.length > 0 || filteredContacts.length > 0;

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

      {!hasAnyPeople && <div className="messages-empty">
        <span className="messages-empty-icon"><Sparkles size={22}/></span>
        <strong>{t('As conversas começam nas conexões.')}</strong>
        <p>{t('Segue alguém ou aceita um seguidor para começares a trocar mensagens na Lumina.')}</p>
      </div>}

      {hasAnyPeople && normalizedQuery && !hasSearchResults && <div className="messages-no-results">{t('Não encontrámos conversas ou pessoas para “{query}”.', { query:query.trim() })}</div>}

      {filteredThreads.length > 0 && <section className="messages-section" aria-label={t('Conversas recentes')}>
        <div className="messages-section-head"><strong>{t('Recentes')}</strong><span>{filteredThreads.length} {filteredThreads.length===1?t('conversa'):t('conversas')}</span></div>
        <div className="messages-thread-list">{filteredThreads.map((item,index)=><button
          key={item.id}
          type="button"
          aria-label={translateDynamic(`Abrir conversa com ${item.name}`)}
          onClick={()=>setThread({id:item.id,name:item.name,handle:item.handle,palette:item.palette,avatar_url:item.avatar_url,other_id:item.other_id,online:!!item.online})}
          className={`messages-thread-card in${item.unread>0?' has-unread':''}`}
          style={{animationDelay:`${Math.min(index,8)*45}ms`}}
        >
          <PresenceAvatar person={item} size={46}/>
          <span className="messages-thread-body">
            <span className="messages-thread-topline"><span className="messages-thread-name">{item.name}</span><span className="messages-thread-handle">@{item.handle}</span></span>
            <span className="messages-thread-preview">{item.body||t('Toca para conversar')}</span>
          </span>
          {item.unread>0 && <span className="messages-unread" aria-label={translateDynamic(`${item.unread} por ler`)}>{item.unread>9?'9+':item.unread}</span>}
        </button>)}</div>
      </section>}

      {filteredContacts.length > 0 && <section className="messages-section" aria-label={t('Pessoas disponíveis')}>
        <div className="messages-section-head"><strong>{t('Começar uma conversa')}</strong><span>{t('Conexões')}</span></div>
        <div className="messages-contact-list">{filteredContacts.map((person,index)=><button
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
    <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} threads={threads}/>
  </div>;
}