import './adaptiveDock.css';

const TOP_LOCK = 56;
const MIN_DELTA = 2;
const DIRECTION_THRESHOLD = 10;
const TOUCH_THRESHOLD = 18;

let hidden = false;
let frame = 0;
let pending = null;
let lastNav = null;
let touchStartX = 0;
let touchStartY = 0;
let touchLastY = 0;
let touchTracking = false;
const stateByScroller = new WeakMap();

function currentNav() {
  return document.querySelector('.nav');
}

function applyVisibility(nextHidden) {
  hidden = nextHidden;
  const nav = currentNav();
  if (!nav) return;
  nav.classList.toggle('nav-smart-hidden', nextHidden);
}

function normalizeScroller(target) {
  if (!target || target === window || target === document || target === document.documentElement || target === document.body) return window;
  return target instanceof Element ? target : window;
}

function hasVerticalRange(scroller) {
  if (scroller === window) {
    const root = document.scrollingElement || document.documentElement;
    return root.scrollHeight > window.innerHeight + 4;
  }
  return scroller instanceof Element && scroller.scrollHeight > scroller.clientHeight + 4;
}

function scrollPosition(scroller) {
  if (scroller === window) {
    return Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
  }
  return Math.max(0, Number(scroller?.scrollTop || 0));
}

function readScroll() {
  frame = 0;
  const scroller = pending || window;
  pending = null;
  if (!hasVerticalRange(scroller)) return;

  const y = scrollPosition(scroller);
  const previous = stateByScroller.get(scroller) || { lastY: y, direction: null, travelled: 0 };

  if (y <= TOP_LOCK) {
    stateByScroller.set(scroller, { lastY: y, direction: null, travelled: 0 });
    applyVisibility(false);
    return;
  }

  const delta = y - previous.lastY;
  if (Math.abs(delta) < MIN_DELTA) {
    stateByScroller.set(scroller, { ...previous, lastY: y });
    return;
  }

  const nextDirection = delta > 0 ? 'down' : 'up';
  const travelled = nextDirection === previous.direction
    ? previous.travelled + Math.abs(delta)
    : Math.abs(delta);

  stateByScroller.set(scroller, { lastY: y, direction: nextDirection, travelled });
  if (travelled < DIRECTION_THRESHOLD) return;

  applyVisibility(nextDirection === 'down');
  stateByScroller.set(scroller, { lastY: y, direction: nextDirection, travelled: 0 });
}

function scheduleRead(event) {
  const scroller = normalizeScroller(event?.target);
  // Carrosséis horizontais (Momentos, media, etc.) também disparam `scroll` no
  // Safari. Nunca devem alterar o estado da navegação inferior.
  if (!hasVerticalRange(scroller)) return;
  pending = scroller;
  if (!frame) frame = requestAnimationFrame(readScroll);
}

function touchPoint(event) {
  const touch = event.touches?.[0] || event.changedTouches?.[0];
  return touch ? { x: touch.clientX, y: touch.clientY } : null;
}

function shouldIgnoreTouch(target) {
  return target instanceof Element && Boolean(target.closest(
    '.nav, input, textarea, select, [contenteditable="true"], [data-dock-gesture-ignore="true"]'
  ));
}

function onTouchStart(event) {
  if (shouldIgnoreTouch(event.target)) {
    touchTracking = false;
    return;
  }
  const point = touchPoint(event);
  if (!point) return;
  touchStartX = point.x;
  touchStartY = point.y;
  touchLastY = point.y;
  touchTracking = true;
}

function onTouchMove(event) {
  if (!touchTracking) return;
  const point = touchPoint(event);
  if (!point) return;

  const totalX = point.x - touchStartX;
  const totalY = point.y - touchStartY;
  const stepY = point.y - touchLastY;
  touchLastY = point.y;

  // Só gestos claramente verticais controlam o dock. Isto mantém carrosséis,
  // Momentos e media horizontal completamente independentes.
  if (Math.abs(totalY) < TOUCH_THRESHOLD || Math.abs(totalY) <= Math.abs(totalX) * 1.15) return;

  // No toque, o dedo sobe quando o conteúdo desce: esconder. O dedo desce
  // quando o utilizador volta para cima: mostrar. Este caminho é deliberado
  // para iOS/PWA, onde `scroll` pode ser coalescido ou entregue ao viewport.
  if (stepY < -MIN_DELTA) applyVisibility(true);
  else if (stepY > MIN_DELTA) applyVisibility(false);
}

function onTouchEnd() {
  touchTracking = false;
}

// `scroll` não faz bubble. Capture deteta a página e contentores verticais
// internos usados em Chat/Salas, sem confundir carrosséis horizontais.
document.addEventListener('scroll', scheduleRead, { passive: true, capture: true });
window.addEventListener('scroll', scheduleRead, { passive: true });

// Safari/iOS PWA nem sempre fornece uma sequência de `scroll` suficientemente
// estável durante o gesto. A direção do swipe é por isso a fonte primária no
// iPhone, mantendo `scroll` como fallback para desktop e contentores internos.
document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
document.addEventListener('touchmove', onTouchMove, { passive: true, capture: true });
document.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
document.addEventListener('touchcancel', onTouchEnd, { passive: true, capture: true });

window.addEventListener('pageshow', () => applyVisibility(false), { passive: true });
window.addEventListener('focus', () => applyVisibility(false), { passive: true });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') applyVisibility(false);
});

// Tocar na própria navegação nunca a pode esconder.
document.addEventListener('pointerdown', (event) => {
  if (event.target instanceof Element && event.target.closest('.nav')) applyVisibility(false);
}, { passive: true });

// Cada ecrã principal monta a sua instância de Nav. Uma instância nova começa
// sempre visível, mas passa imediatamente a obedecer ao próximo scroll vertical.
const root = document.getElementById('root');
if (root) {
  const observer = new MutationObserver(() => {
    const nav = currentNav();
    if (!nav) {
      lastNav = null;
      return;
    }
    if (nav !== lastNav) {
      lastNav = nav;
      hidden = false;
      nav.classList.remove('nav-smart-hidden');
      return;
    }
    nav.classList.toggle('nav-smart-hidden', hidden);
  });
  observer.observe(root, { childList: true, subtree: true });
}
