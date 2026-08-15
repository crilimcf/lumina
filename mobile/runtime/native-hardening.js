(() => {
  'use strict';

  if (!window.__LUMINA_NATIVE__) return;

  const cap = window.Capacitor || {};
  const plugins = cap.Plugins || {};
  const platform = window.__LUMINA_PLATFORM__ || (typeof cap.getPlatform === 'function' ? cap.getPlatform() : 'web');
  const Push = plugins.PushNotifications;
  const Preferences = plugins.Preferences;
  const PUSH_TOKEN_KEY = 'lumina.native.push.token.v1';
  const underlyingFetch = window.fetch.bind(window);

  const locale = String(navigator.language || 'pt').toLowerCase();
  const channelCopy = locale.startsWith('fr')
    ? { name:'Activité Lumina', description:'Messages, appels et activité de ton réseau.' }
    : locale.startsWith('es')
      ? { name:'Actividad de Lumina', description:'Mensajes, llamadas y actividad de tu red.' }
      : locale.startsWith('en')
        ? { name:'Lumina activity', description:'Messages, calls and activity from your network.' }
        : { name:'Atividade Lumina', description:'Mensagens, chamadas e atividade da tua rede.' };

  async function getStoredPushToken() {
    try {
      if (Preferences?.get) return (await Preferences.get({ key:PUSH_TOKEN_KEY }))?.value || null;
    } catch { /* fallback below */ }
    return localStorage.getItem(PUSH_TOKEN_KEY);
  }

  async function setStoredPushToken(value) {
    try {
      if (value && Preferences?.set) await Preferences.set({ key:PUSH_TOKEN_KEY, value });
      else if (!value && Preferences?.remove) await Preferences.remove({ key:PUSH_TOKEN_KEY });
      else if (value) localStorage.setItem(PUSH_TOKEN_KEY, value);
      else localStorage.removeItem(PUSH_TOKEN_KEY);
    } catch {
      if (value) localStorage.setItem(PUSH_TOKEN_KEY, value);
      else localStorage.removeItem(PUSH_TOKEN_KEY);
    }
  }

  async function createAndroidChannel() {
    if (platform !== 'android' || !Push?.createChannel) return;
    try {
      await Push.createChannel({
        id:'lumina_activity',
        name:channelCopy.name,
        description:channelCopy.description,
        importance:4,
        visibility:1,
        vibration:true,
      });
    } catch (error) {
      console.debug('[native-push] channel', error);
    }
  }

  async function registerAgainWhenAllowed() {
    if (!Push?.checkPermissions || !Push?.register) return;
    try {
      const status = await Push.checkPermissions();
      if (status?.receive === 'granted') await Push.register();
    } catch { /* registration is best effort here */ }
  }

  Push?.addListener?.('registration', async ({ value }) => {
    if (value) await setStoredPushToken(value);
  });

  window.fetch = async (input, init = {}) => {
    const rawUrl = input instanceof Request ? input.url : String(input || '');
    const url = rawUrl.startsWith('http') ? rawUrl : new URL(rawUrl, location.href).pathname;
    const isLogout = /\/api\/auth\/logout(?:\?|$)/.test(url);
    const isLogin = /\/api\/auth\/(?:login|register)(?:\?|$)/.test(url);

    if (isLogout) {
      const pushToken = await getStoredPushToken();
      if (pushToken) {
        try {
          await underlyingFetch('/api/notifications/native/unsubscribe', {
            method:'POST',
            headers:{ 'content-type':'application/json' },
            body:JSON.stringify({ token:pushToken }),
          });
        } catch { /* stale server token will be cleaned on provider response */ }
      }
    }

    const response = await underlyingFetch(input, init);

    if (isLogout && response.ok) {
      try { await Push?.unregister?.(); } catch { /* ignored */ }
      await setStoredPushToken(null);
    } else if (isLogin && response.ok) {
      setTimeout(() => registerAgainWhenAllowed().catch(() => {}), 250);
    }

    return response;
  };

  createAndroidChannel().catch(() => {});
  setTimeout(async () => {
    try {
      const me = await underlyingFetch('/api/auth/me', { cache:'no-store' });
      if (me?.ok) await registerAgainWhenAllowed();
    } catch { /* offline or signed out */ }
  }, 1600);
})();
