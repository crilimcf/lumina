(() => {
  const locales = { pt:'pt-PT', en:'en-US', fr:'fr-FR', es:'es-ES' };
  const descriptions = {
    pt:'Feed, Salas, Momentos e conversas num só espaço para a tua rede.',
    en:'Feed, Rooms, Moments and conversations in one place for your network.',
    fr:'Fil, Salons, Moments et conversations réunis dans un seul espace pour ton réseau.',
    es:'Feed, Salas, Momentos y conversaciones en un solo espacio para tu red.',
  };

  const candidates = [...(Array.isArray(navigator.languages) ? navigator.languages : []), navigator.language].filter(Boolean);
  const language = candidates
    .map(value => String(value).toLowerCase().split(/[-_]/)[0])
    .find(value => locales[value]) || 'en';

  document.documentElement.lang = locales[language];
  document.querySelector('meta[name="description"]')?.setAttribute('content', descriptions[language]);
  window.__luminaDeviceLanguage = language;

  // Keep one stable manifest URL from the first HTML parse. Some Android browsers
  // discover/install PWAs earlier than others, so swapping the manifest at runtime
  // can make the same site look installable in one browser and like a plain shortcut
  // in another. The app itself remains localized independently from the manifest.
  let deferredInstallPrompt = null;
  let installState = 'unknown';

  const isIOSWeb = () => {
    const ua = navigator.userAgent || '';
    const touchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return (/iPad|iPhone|iPod/i.test(ua) || touchMac) && !window.Capacitor?.isNativePlatform?.();
  };

  const installCopy = {
    pt:{
      ios:'No Safari, toca em Partilhar (quadrado com seta) → Adicionar ao ecrã principal → Adicionar. “Marcador/Favoritos” não instala a app.',
      generic:'Abre o menu deste browser e escolhe Instalar aplicação ou Adicionar ao ecrã principal.',
    },
    en:{
      ios:'In Safari, tap Share (square with arrow) → Add to Home Screen → Add. “Bookmark/Favorites” does not install the app.',
      generic:'Open this browser menu and choose Install app or Add to Home Screen.',
    },
    fr:{
      ios:'Dans Safari, touche Partager (carré avec flèche) → Sur l’écran d’accueil → Ajouter. “Signet/Favoris” n’installe pas l’app.',
      generic:'Ouvre le menu du navigateur et choisis Installer l’app ou Ajouter à l’écran d’accueil.',
    },
    es:{
      ios:'En Safari, toca Compartir (cuadrado con flecha) → Añadir a pantalla de inicio → Añadir. “Marcador/Favoritos” no instala la app.',
      generic:'Abre el menú del navegador y elige Instalar aplicación o Añadir a pantalla de inicio.',
    },
  };

  const manualInstruction = () => {
    const copy = installCopy[language] || installCopy.en;
    return isIOSWeb() ? copy.ios : copy.generic;
  };

  const isStandalone = () => (
    window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.matchMedia?.('(display-mode: fullscreen)')?.matches
    || window.navigator.standalone === true
    || document.referrer.startsWith('android-app://')
  );

  const installSnapshot = () => ({
    standalone:isStandalone(),
    promptAvailable:!!deferredInstallPrompt,
    state:isStandalone() ? 'installed' : installState,
    serviceWorkerSupported:'serviceWorker' in navigator,
    serviceWorkerReady:window.__luminaPwaServiceWorkerReady === true,
    platform:isIOSWeb() ? 'ios-web' : 'web',
    instruction:manualInstruction(),
  });

  const dispatchInstallState = (name) => {
    window.dispatchEvent(new CustomEvent(name, { detail:installSnapshot() }));
    window.dispatchEvent(new CustomEvent('lumina:pwa-install-state', { detail:installSnapshot() }));
  };

  // Capability-based install flow: no Chrome, Samsung Internet, Edge, Brave,
  // Opera or Firefox special case is required. Browsers that expose the native
  // install prompt use it; browsers that do not still keep their own menu-based
  // Install/Add-to-home-screen flow with the same manifest and service worker.
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installState = 'prompt-available';
    dispatchInstallState('lumina:pwa-installable');
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installState = 'installed';
    dispatchInstallState('lumina:pwa-installed');
  });

  window.__luminaPwaInstallSnapshot = async () => installSnapshot();
  window.__luminaInstallPwa = async () => {
    if (isStandalone()) return { status:'installed', ...installSnapshot() };
    if (!deferredInstallPrompt) {
      installState = 'manual';
      dispatchInstallState('lumina:pwa-manual-install');
      return { status:'manual', ...installSnapshot() };
    }

    const prompt = deferredInstallPrompt;
    deferredInstallPrompt = null;
    installState = 'prompting';
    dispatchInstallState('lumina:pwa-install-state');

    try {
      await prompt.prompt();
      const choice = await prompt.userChoice.catch(() => null);
      const accepted = choice?.outcome === 'accepted';
      installState = accepted ? 'accepted' : 'dismissed';
      dispatchInstallState(accepted ? 'lumina:pwa-install-accepted' : 'lumina:pwa-install-dismissed');
      return { status:installState, ...installSnapshot() };
    } catch (error) {
      installState = 'manual';
      dispatchInstallState('lumina:pwa-manual-install');
      return {
        status:'manual',
        error:String(error?.message || error || 'install_prompt_failed'),
        ...installSnapshot(),
      };
    }
  };

  window.__luminaPwaInstallHelp = () => ({
    status:isStandalone() ? 'installed' : 'manual',
    ...installSnapshot(),
  });

  if (isStandalone()) installState = 'installed';
  else installState = 'browser-menu';

  const secureEnough = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!('serviceWorker' in navigator) || !secureEnough) {
    window.__luminaPwaServiceWorkerReady = false;
    dispatchInstallState('lumina:pwa-install-state');
    return;
  }

  const registerServiceWorker = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope:'/',
        updateViaCache:'none',
      });
      await navigator.serviceWorker.ready;
      window.__luminaPwaServiceWorkerReady = true;
      window.dispatchEvent(new CustomEvent('lumina:pwa-ready', { detail:{ registration, ...installSnapshot() } }));
      dispatchInstallState('lumina:pwa-install-state');
    } catch (error) {
      window.__luminaPwaServiceWorkerReady = false;
      window.dispatchEvent(new CustomEvent('lumina:pwa-error', {
        detail:{ message:String(error?.message || error || 'service_worker_failed'), ...installSnapshot() },
      }));
      dispatchInstallState('lumina:pwa-install-state');
      console.warn('[pwa-install] service worker registration failed', error?.message || error);
    }
  };

  if (document.readyState === 'complete') void registerServiceWorker();
  else window.addEventListener('load', () => { void registerServiceWorker(); }, { once:true });
})();
