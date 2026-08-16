const params = new URLSearchParams(window.location.search);
const fragment = new URLSearchParams(window.location.hash.slice(1));
const nativeSession = fragment.get('nativeSession') || params.get('nativeSession');
const mobileAuth = params.get('mobileAuth');

const statusBox = message => {
  let box = document.querySelector('[data-mobile-auth-status]');
  if (!box) {
    box = document.createElement('div');
    box.dataset.mobileAuthStatus = '1';
    Object.assign(box.style, {
      position:'fixed', zIndex:'400', left:'14px', right:'14px', top:'calc(14px + env(safe-area-inset-top))',
      maxWidth:'470px', margin:'0 auto', padding:'13px 16px', borderRadius:'18px',
      background:'rgba(20,18,42,.96)', color:'#fff', font:'600 13px/1.4 system-ui,sans-serif',
      boxShadow:'0 16px 40px rgba(20,18,42,.3)', textAlign:'center',
    });
    document.body.append(box);
  }
  box.textContent = message;
  return box;
};

async function exchangeBrowserSession(code) {
  statusBox('A abrir a gestão segura da tua conta…');
  const response = await fetch('/api/auth/mobile/browser-exchange', {
    method:'POST',
    credentials:'include',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify({ code }),
  });
  if (!response.ok) throw new Error('Esta ligação expirou. Volta à aplicação e tenta novamente.');
  const clean = new URL(window.location.href);
  clean.searchParams.delete('nativeSession');
  clean.hash = '';
  window.location.replace(clean.toString());
}

async function completeMobileLogin(id) {
  let stopped = false;
  statusBox('Entra na tua conta. No fim voltas automaticamente à Lumina.');
  const attempt = async () => {
    if (stopped) return;
    const me = await fetch('/api/auth/me', { credentials:'include', cache:'no-store' }).catch(() => null);
    if (!me?.ok) return;
    const session = await me.json().catch(() => ({}));
    if (!session.csrf) return;
    stopped = true;
    statusBox('Login confirmado. A voltar à aplicação…');
    const completed = await fetch(`/api/auth/mobile/${encodeURIComponent(id)}/complete`, {
      method:'POST',
      credentials:'include',
      headers:{ 'content-type':'application/json', 'x-csrf-token':session.csrf },
      body:'{}',
    });
    const data = await completed.json().catch(() => ({}));
    if (!completed.ok || !data.redirectUrl) throw new Error(data.error || 'Não foi possível voltar à aplicação.');
    window.location.assign(data.redirectUrl);
  };
  const timer = window.setInterval(() => attempt().catch(error => {
    stopped = true;
    window.clearInterval(timer);
    statusBox(error.message);
  }), 900);
  await attempt();
  if (stopped) window.clearInterval(timer);
}

if (nativeSession) {
  exchangeBrowserSession(nativeSession).catch(error => statusBox(error.message));
} else if (mobileAuth) {
  completeMobileLogin(mobileAuth).catch(error => statusBox(error.message));
}
