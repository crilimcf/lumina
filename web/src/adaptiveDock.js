import './adaptiveDock.css';

const TOP_LOCK = 72;
const MIN_DELTA = 2;
const DIRECTION_THRESHOLD = 14;

let hidden = false;
let frame = 0;
let pending = null;
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

function scrollPosition(scroller) {
  if (scroller === window || scroller === document || scroller === document.documentElement || scroller === document.body) {
    return Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
  }
  return Math.max(0, scroller?.scrollTop || 0);
}

function normalizeScroller(target) {
  if (!target || target === document || target === document.documentElement || target === document.body) return window;
  return target instanceof Element ? target : window;
}

function readScroll() {
  frame = 0;
  const scroller = pending || window;
  pending = null;
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
  pending = normalizeScroller(event?.target);
  if (!frame) frame = requestAnimationFrame(readScroll);
}

// `scroll` não faz bubble. Capture permite detetar tanto o scroll da página
// como os contentores internos usados em chats/salas no Safari e Android.
document.addEventListener('scroll', scheduleRead, { passive: true, capture: true });
window.addEventListener('scroll', scheduleRead, { passive: true });

window.addEventListener('pageshow', () => {
  pending = window;
  applyVisibility(false);
}, { passive: true });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') applyVisibility(false);
});

/* Navigation itself should never disappear as a side effect of tapping it. */
document.addEventListener('pointerdown', (event) => {
  if (event.target instanceof Element && event.target.closest('.nav')) applyVisibility(false);
}, { passive: true });

/* New screens can remount their own .nav. Reapply the current state without
   coupling the behavior to individual React screens. */
const root = document.getElementById('root');
if (root) {
  const observer = new MutationObserver(() => {
    const nav = currentNav();
    if (nav) nav.classList.toggle('nav-smart-hidden', hidden);
  });
  observer.observe(root, { childList: true, subtree: true });
}
