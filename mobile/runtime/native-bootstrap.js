(() => {
  'use strict';

  const API_ORIGIN = 'https://lumina-snowy-ten.vercel.app';
  const SESSION_KEY = 'lumina.native.session.v1';
  const PUSH_LATER_KEY = 'lumina.native.push.later.v1';
  const cap = window.Capacitor || {};
  const plugins = cap.Plugins || {};
  const platform = typeof cap.getPlatform === 'function' ? cap.getPlatform() : 'web';
  const native = platform === 'ios' || platform === 'android' || /^capacitor:|^ionic:/.test(location.protocol);

  if (!native) return;

  window.__LUMINA_NATIVE__ = true;
  window.__LUMINA_PLATFORM__ = platform;
  document.documentElement.dataset.luminaNative = platform;

  let token = null;
  const Preferences = plugins.Preferences;
  const storageReady = (async () => {
    try {
      if (Preferences?.get) {
        const result = await Preferences.get({ key: SESSION_KEY });
        token = result?.value || null;
      } else token = localStorage.getItem(SESSION_KEY);
    } catch {
      token = localStorage.getItem(SESSION_KEY);
    }
    return token;
  })();

  async function persistToken(next) {
    token = next || null;
    try {
      if (Preferences?.set && token) await Preferences.set({ key:SESSION_KEY, value:token });
      else if (Preferences?.remove && !token) await Preferences.remove({ key:SESSION_KEY });
      else if (token) localStorage.setItem(SESSION_KEY, token);
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      if (token) localStorage.setItem(SESSION_KEY, token);
      else localStorage.removeItem(SESSION_KEY);
    }
  }

  const apiUrl = value => {
    const text = String(value || '');
    if (text === '/api' || text.startsWith('/api/')) return `${API_ORIGIN}${text}`;
    return text;
  };

  const isApiUrl = value => {
    const text = String(value || '');
    return text === '/api' || text.startsWith('/api/') || text.startsWith(`${API_ORIGIN}/api/`);
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    await storageReady;
    const request = input instanceof Request ? input : null;
    const rawUrl = request?.url || String(input || '');
    if (!isApiUrl(rawUrl)) return originalFetch(input, init);

    const headers = new Headers(request?.headers || undefined);
    new Headers(init.headers || undefined).forEach((value, key) => headers.set(key, value));
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const method = init.method || request?.method;
    const body = Object.prototype.hasOwnProperty.call(init, 'body') ? init.body : request?.body;
    const options = {
      ...init,
      method,
      body,
      headers,
      credentials:'omit',
      mode:'cors',
    };

    const response = await originalFetch(apiUrl(rawUrl), options);
    const authResponse = /\/api\/auth\/(login|register|change-password)(?:\?|$)/.test(apiUrl(rawUrl));
    if (authResponse && response.ok) {
      try {
        const data = await response.clone().json();
        if (typeof data?.token === 'string' && data.token.length > 20) await persistToken(data.token);
      } catch { /* response may be empty */ }
    }
    if (/\/api\/auth\/logout(?:\?|$)/.test(apiUrl(rawUrl)) && response.ok) await persistToken(null);
    if (response.status === 401) await persistToken(null);
    return response;
  };

  class NativeEventSource {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 2;

    constructor(url) {
      this.url = apiUrl(url);
      this.readyState = NativeEventSource.CONNECTING;
      this.withCredentials = false;
      this.onopen = null;
      this.onmessage = null;
      this.onerror = null;
      this.listeners = new Map();
      this.closed = false;
      this.controller = null;
      this.retry = 5000;
      this.connect();
    }

    addEventListener(type, handler) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(handler);
    }

    removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }

    dispatch(type, event) {
      try { this[`on${type}`]?.(event); } catch { /* consumer error */ }
      for (const handler of this.listeners.get(type) || []) {
        try { handler(event); } catch { /* consumer error */ }
      }
    }

    async connect() {
      if (this.closed) return;
      await storageReady;
      this.controller = new AbortController();
      try {
        const headers = { Accept:'text/event-stream', 'cache-control':'no-cache' };
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await originalFetch(this.url, {
          headers,
          credentials:'omit',
          cache:'no-store',
          mode:'cors',
          signal:this.controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(`SSE ${response.status}`);
        this.readyState = NativeEventSource.OPEN;
        this.dispatch('open', new Event('open'));

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!this.closed) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream:true }).replace(/\r\n/g, '\n');
          let boundary;
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            let eventType = 'message';
            const data = [];
            for (const line of frame.split('\n')) {
              if (line.startsWith('retry:')) this.retry = Math.max(1000, Number(line.slice(6).trim()) || this.retry);
              else if (line.startsWith('event:')) eventType = line.slice(6).trim() || 'message';
              else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
            }
            if (data.length) {
              const event = new MessageEvent(eventType, { data:data.join('\n') });
              this.dispatch(eventType, event);
              if (eventType !== 'message') this.dispatch('message', event);
            }
          }
        }
        if (!this.closed) throw new Error('SSE closed');
      } catch (error) {
        if (this.closed || error?.name === 'AbortError') return;
        this.readyState = NativeEventSource.CONNECTING;
        this.dispatch('error', new Event('error'));
        setTimeout(() => this.connect(), this.retry);
      }
    }

    close() {
      this.closed = true;
      this.readyState = NativeEventSource.CLOSED;
      this.controller?.abort();
    }
  }

  window.EventSource = NativeEventSource;

  function navigateInside(raw) {
    try {
      const url = new URL(raw, API_ORIGIN);
      const local = `${url.pathname}${url.search}${url.hash}` || '/';
      history.replaceState({}, '', local);
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.dispatchEvent(new CustomEvent('lumina:native-link', { detail:{ url:local } }));
    } catch { /* ignored */ }
  }

  async function setupNativeUi() {
    try { await plugins.StatusBar?.setStyle?.({ style:'LIGHT' }); } catch { /* ignored */ }
    try { await plugins.StatusBar?.setOverlaysWebView?.({ overlay:true }); } catch { /* ignored */ }
    try { await plugins.Keyboard?.setResizeMode?.({ mode:'native' }); } catch { /* ignored */ }
    try { await plugins.SplashScreen?.hide?.({ fadeOutDuration:220 }); } catch { /* ignored */ }

    plugins.App?.addListener?.('appUrlOpen', ({ url }) => {
      if (!url) return;
      if (url.startsWith('lumina://')) {
        const translated = url.replace(/^lumina:\/\//, `${API_ORIGIN}/`);
        navigateInside(translated);
      } else if (url.startsWith(API_ORIGIN)) navigateInside(url);
    });

    plugins.App?.addListener?.('backButton', ({ canGoBack }) => {
      if (platform !== 'android') return;
      if (canGoBack || history.length > 1) history.back();
      else plugins.App?.minimizeApp?.();
    });

    window.__luminaHaptic = async (style = 'LIGHT') => {
      try { await plugins.Haptics?.impact?.({ style }); } catch { /* ignored */ }
    };
    window.__luminaShare = async data => {
      if (plugins.Share?.share) return plugins.Share.share(data || { title:'Lumina', url:API_ORIGIN });
      return false;
    };
    window.__luminaOpenExternal = async url => {
      if (plugins.Browser?.open) return plugins.Browser.open({ url });
      location.href = url;
    };
  }

  const locale = (() => {
    const lang = String(navigator.language || 'pt').toLowerCase();
    if (lang.startsWith('fr')) return 'fr';
    if (lang.startsWith('es')) return 'es';
    if (lang.startsWith('en')) return 'en';
    return 'pt';
  })();
  const pushCopy = {
    pt:{ title:'Não percas mensagens nem chamadas', body:'Ativa as notificações da Lumina neste dispositivo.', enable:'Ativar', later:'Agora não' },
    fr:{ title:'Ne manque aucun message ni appel', body:'Active les notifications Lumina sur cet appareil.', enable:'Activer', later:'Plus tard' },
    en:{ title:'Don’t miss messages or calls', body:'Enable Lumina notifications on this device.', enable:'Enable', later:'Not now' },
    es:{ title:'No te pierdas mensajes ni llamadas', body:'Activa las notificaciones de Lumina en este dispositivo.', enable:'Activar', later:'Ahora no' },
  }[locale];

  let pushReady = false;
  let pushBanner = null;
  async function registerNativePush() {
    const Push = plugins.PushNotifications;
    if (!Push?.requestPermissions || !Push?.register) return false;
    let permission = await Push.checkPermissions?.();
    if (permission?.receive === 'prompt' || permission?.receive === 'prompt-with-rationale') permission = await Push.requestPermissions();
    if (permission?.receive !== 'granted') return false;
    await Push.register();
    return true;
  }

  async function setupPush() {
    const Push = plugins.PushNotifications;
    if (!Push?.addListener || pushReady) return;
    pushReady = true;

    await Push.addListener('registration', async ({ value }) => {
      if (!value) return;
      await window.fetch('/api/notifications/native/subscribe', {
        method:'POST',
        headers:{ 'content-type':'application/json' },
        body:JSON.stringify({ platform, token:value, deviceId:`${platform}:${navigator.userAgent.slice(0,120)}` }),
      }).catch(() => null);
      pushBanner?.remove(); pushBanner = null;
    });
    await Push.addListener('registrationError', error => console.debug('[native-push] registration', error));
    await Push.addListener('pushNotificationReceived', notification => {
      window.dispatchEvent(new CustomEvent('lumina:notifications-changed', { detail:notification?.data || {} }));
    });
    await Push.addListener('pushNotificationActionPerformed', action => {
      const url = action?.notification?.data?.url;
      if (url) navigateInside(url);
    });

    window.__luminaEnableNativePush = registerNativePush;
    window.__luminaNativePushSnapshot = async () => {
      const permission = await Push.checkPermissions?.().catch(() => ({ receive:'unknown' }));
      return { supported:true, platform, permission:permission?.receive || 'unknown' };
    };
  }

  async function maybeOfferPush() {
    const Push = plugins.PushNotifications;
    if (!Push?.checkPermissions || pushBanner || sessionStorage.getItem(PUSH_LATER_KEY)) return;
    const me = await window.fetch('/api/auth/me', { cache:'no-store' }).catch(() => null);
    if (!me?.ok) return;
    const permission = await Push.checkPermissions().catch(() => null);
    if (!permission || permission.receive !== 'prompt') return;

    const box = document.createElement('div');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', pushCopy.title);
    Object.assign(box.style, {
      position:'fixed', left:'14px', right:'14px', top:'calc(14px + env(safe-area-inset-top))', zIndex:'300',
      maxWidth:'470px', margin:'0 auto', padding:'14px', borderRadius:'22px', background:'rgba(20,18,42,.97)',
      color:'#fff', boxShadow:'0 16px 44px rgba(20,18,42,.36)', fontFamily:'Manrope,system-ui,sans-serif',
      display:'flex', gap:'10px', alignItems:'center'
    });
    const copy = document.createElement('div');
    copy.style.flex = '1';
    copy.innerHTML = `<div style="font-weight:800;font-size:14px">${pushCopy.title}</div><div style="font-size:11px;opacity:.72;margin-top:3px;line-height:1.35">${pushCopy.body}</div>`;
    const activate = document.createElement('button');
    activate.textContent = pushCopy.enable;
    Object.assign(activate.style, { border:0,borderRadius:'999px',padding:'10px 14px',fontWeight:'800',background:'#fff',color:'#14122A' });
    activate.onclick = async () => { activate.disabled = true; const ok = await registerNativePush(); if (!ok) activate.disabled = false; };
    const later = document.createElement('button');
    later.textContent = '×'; later.setAttribute('aria-label', pushCopy.later);
    Object.assign(later.style, { border:0,background:'transparent',color:'#fff',fontSize:'22px',padding:'4px' });
    later.onclick = () => { sessionStorage.setItem(PUSH_LATER_KEY, '1'); box.remove(); pushBanner = null; };
    box.append(copy, activate, later);
    document.body.appendChild(box);
    pushBanner = box;
  }

  Promise.resolve().then(setupNativeUi).then(setupPush).then(() => {
    setTimeout(() => maybeOfferPush().catch(() => {}), 1200);
    setInterval(() => maybeOfferPush().catch(() => {}), 20_000);
  });
})();
