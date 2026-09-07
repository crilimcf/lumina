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

  let deferredInstallPrompt = null;
  let installState = 'unknown';

  const isIOSWeb = () => {
    const ua = navigator.userAgent || '';
    const touchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return (/iPad|iPhone|iPod/i.test(ua) || touchMac) && !window.Capacitor?.isNativePlatform?.();
  };

  const installCopy = {
    pt:{
      title:'Instalar Lumina no iPhone',
      ios:'No Safari: Partilhar → Adicionar ao ecrã principal → Adicionar.',
      generic:'Abre o menu deste browser e escolhe Instalar aplicação ou Adicionar ao ecrã principal.',
      steps:['Toca no botão Partilhar (quadrado com seta).','Na lista, escolhe “Adicionar ao ecrã principal”.','No ecrã seguinte, confirma em “Adicionar”.'],
      warning:'Não escolhas “Marcador” ou “Favoritos”: Guardar aí cria apenas um favorito e não instala a app.',
      close:'Entendido',
    },
    en:{
      title:'Install Lumina on iPhone',
      ios:'In Safari: Share → Add to Home Screen → Add.',
      generic:'Open this browser menu and choose Install app or Add to Home Screen.',
      steps:['Tap Share (square with arrow).','Choose “Add to Home Screen”.','On the next screen, confirm with “Add”.'],
      warning:'Do not choose “Bookmark” or “Favorites”: saving there only creates a bookmark and does not install the app.',
      close:'Got it',
    },
    fr:{
      title:'Installer Lumina sur iPhone',
      ios:'Dans Safari : Partager → Sur l’écran d’accueil → Ajouter.',
      generic:'Ouvre le menu du navigateur et choisis Installer l’app ou Ajouter à l’écran d’accueil.',
      steps:['Touche Partager (carré avec flèche).','Choisis “Sur l’écran d’accueil”.','Sur l’écran suivant, confirme avec “Ajouter”.'],
      warning:'Ne choisis pas “Signet” ou “Favoris” : cela crée seulement un favori et n’installe pas l’app.',
      close:'Compris',
    },
    es:{
      title:'Instalar Lumina en iPhone',
      ios:'En Safari: Compartir → Añadir a pantalla de inicio → Añadir.',
      generic:'Abre el menú del navegador y elige Instalar aplicación o Añadir a pantalla de inicio.',
      steps:['Toca Compartir (cuadrado con flecha).','Elige “Añadir a pantalla de inicio”.','En la pantalla siguiente, confirma con “Añadir”.'],
      warning:'No elijas “Marcador” o “Favoritos”: solo guarda un favorito y no instala la app.',
      close:'Entendido',
    },
  };

  const manualInstruction = () => {
    const copy = installCopy[language] || installCopy.en;
    return isIOSWeb() ? copy.ios : copy.generic;
  };

  const showIOSInstallGuide = () => {
    if (!isIOSWeb() || document.getElementById('lumina-pwa-install-guide')) return;
    const copy = installCopy[language] || installCopy.en;
    const backdrop = document.createElement('div');
    backdrop.id = 'lumina-pwa-install-guide';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', copy.title);
    Object.assign(backdrop.style, {
      position:'fixed', inset:'0', zIndex:'2147483647', display:'grid', alignItems:'end',
      background:'rgba(4,7,16,.58)', backdropFilter:'blur(9px)', WebkitBackdropFilter:'blur(9px)',
      padding:'max(14px, env(safe-area-inset-top)) 14px max(14px, env(safe-area-inset-bottom))', boxSizing:'border-box',
    });

    const card = document.createElement('div');
    Object.assign(card.style, {
      width:'min(100%, 520px)', margin:'0 auto', borderRadius:'28px', padding:'22px', boxSizing:'border-box',
      background:'#fff', color:'#101322', boxShadow:'0 28px 90px rgba(0,0,0,.32)', fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    });
    const title = document.createElement('div');
    title.textContent = copy.title;
    Object.assign(title.style, { fontSize:'22px', fontWeight:'800', letterSpacing:'-.02em', marginBottom:'14px' });
    card.appendChild(title);

    const list = document.createElement('ol');
    Object.assign(list.style, { margin:'0', paddingLeft:'23px', display:'grid', gap:'11px', fontSize:'16px', lineHeight:'1.35', fontWeight:'650' });
    copy.steps.forEach(step => {
      const item = document.createElement('li');
      item.textContent = step;
      list.appendChild(item);
    });
    card.appendChild(list);

    const warning = document.createElement('div');
    warning.textContent = copy.warning;
    Object.assign(warning.style, { marginTop:'17px', padding:'13px 14px', borderRadius:'16px', background:'#fff2ef', color:'#8f281c', fontSize:'14px', lineHeight:'1.4', fontWeight:'700' });
    card.appendChild(warning);

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = copy.close;
    Object.assign(close.style, { width:'100%', marginTop:'16px', border:'0', borderRadius:'16px', padding:'14px 16px', background:'#1717e8', color:'#fff', fontSize:'16px', fontWeight:'800' });
    const remove = () => backdrop.remove();
    close.addEventListener('click', remove);
    backdrop.addEventListener('click', event => { if (event.target === backdrop) remove(); });
    card.appendChild(close);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
    close.focus({ preventScroll:true });
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
  window.__luminaShowPwaInstallGuide = showIOSInstallGuide;
  window.__luminaInstallPwa = async () => {
    if (isStandalone()) return { status:'installed', ...installSnapshot() };
    if (!deferredInstallPrompt) {
      installState = 'manual';
      dispatchInstallState('lumina:pwa-manual-install');
      showIOSInstallGuide();
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
      showIOSInstallGuide();
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
