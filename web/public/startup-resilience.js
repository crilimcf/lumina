// A pre-React safety net for failed JavaScript imports on slow or stale PWA installs.
// It never touches sessions, storage, user data, or working service workers.
(() => {
  const words = {
    pt: ['A Lumina não conseguiu arrancar.', 'Os teus dados estão seguros. Tenta carregar a aplicação novamente.', 'Tentar novamente'],
    en: ['Lumina could not start.', 'Your data is safe. Try loading the app again.', 'Try again'],
    fr: ["Lumina n’a pas pu démarrer.", "Tes données sont en sécurité. Essaie de recharger l’application.", 'Réessayer'],
    es: ['Lumina no ha podido iniciarse.', 'Tus datos están seguros. Intenta cargar la aplicación de nuevo.', 'Reintentar'],
  };
  const lang = [...(navigator.languages || []), navigator.language].map(x => String(x || '').slice(0,2).toLowerCase())
    .find(x => words[x]) || 'pt';
  let timer;
  const verify = () => {
    const root = document.getElementById('root');
    if (!root || root.childElementCount > 0 || root.textContent.trim()) return;
    const [title, help, again] = words[lang];
    const panel = document.createElement('div');
    panel.setAttribute('role', 'alert');
    panel.className = 'lumina-boot-recovery';
    Object.assign(panel.style, {
      minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: '15px', padding: '32px', textAlign: 'center',
      fontFamily: 'system-ui, sans-serif', color: '#f7f8ff',
      background: 'radial-gradient(ellipse at 45% 0%,#33477b,#0b1428 68%)',
    });
    const mark = document.createElement('strong');
    mark.textContent = '✦ Lumina';
    mark.style.fontSize = '32px';
    const headline = document.createElement('h1');
    headline.textContent = title;
    Object.assign(headline.style, { fontSize: '22px', margin: 0 });
    const description = document.createElement('p');
    description.textContent = help;
    Object.assign(description.style, { fontSize: '14px', lineHeight: '1.5', maxWidth: '340px', margin: 0, color: '#c5d5ef' });
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = again;
    Object.assign(button.style, {
      minHeight: '48px', borderRadius: '14px', padding: '12px 22px',
      border: '1px solid #d9ddff', background: '#f0efff', color: '#12203a',
      fontWeight: '800', fontSize: '15px', cursor: 'pointer',
    });
    button.addEventListener('click', () => {
      // Force a fresh document request without touching sessions or stored content.
      const next = new URL(window.location.href);
      next.searchParams.set('__lumina_boot_retry', String(Date.now()));
      window.location.replace(next.toString());
    });
    panel.append(mark, headline, description, button);
    root.replaceChildren(panel);
  };
  const start = () => {
    clearTimeout(timer);
    timer = setTimeout(verify, 9000);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  // MIME errors on stale release assets must never leave an empty screen.
  const accelerateRecovery = () => {
    clearTimeout(timer);
    timer = setTimeout(verify, 1200);
  };
  window.addEventListener('error', (event) => {
    const failed = event.target;
    const path = failed?.src || failed?.href || '';
    if ((failed?.tagName === 'SCRIPT' || failed?.tagName === 'LINK') &&
      (path.includes('/assets/') || path.includes('/src/'))) accelerateRecovery();
  }, true);
  window.addEventListener('unhandledrejection', (event) => {
    const message = String(event?.reason?.message || event?.reason || '');
    if (/Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|module script/i.test(message)) {
      accelerateRecovery();
    }
  });
})();
