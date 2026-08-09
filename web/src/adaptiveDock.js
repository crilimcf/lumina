import './adaptiveDock.css';

const TOP_LOCK = 72;
const MIN_DELTA = 2;
const DIRECTION_THRESHOLD = 18;

let lastY = Math.max(0, window.scrollY || 0);
let direction = null;
let travelled = 0;
let hidden = false;
let frame = 0;

function currentNav() {
  return document.querySelector('.nav');
}

function applyVisibility(nextHidden) {
  hidden = nextHidden;
  const nav = currentNav();
  if (!nav) return;
  nav.classList.toggle('nav-smart-hidden', nextHidden);
}

function readScroll() {
  frame = 0;
  const y = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);

  if (y <= TOP_LOCK) {
    direction = null;
    travelled = 0;
    lastY = y;
    applyVisibility(false);
    return;
  }

  const delta = y - lastY;
  lastY = y;
  if (Math.abs(delta) < MIN_DELTA) return;

  const nextDirection = delta > 0 ? 'down' : 'up';
  if (nextDirection !== direction) {
    direction = nextDirection;
    travelled = 0;
  }

  travelled += Math.abs(delta);
  if (travelled < DIRECTION_THRESHOLD) return;

  applyVisibility(direction === 'down');
  travelled = 0;
}

function scheduleRead() {
  if (!frame) frame = requestAnimationFrame(readScroll);
}

window.addEventListener('scroll', scheduleRead, { passive: true });
window.addEventListener('pageshow', () => {
  lastY = Math.max(0, window.scrollY || 0);
  applyVisibility(false);
}, { passive: true });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    lastY = Math.max(0, window.scrollY || 0);
    applyVisibility(false);
  }
});

/* Navigation itself should never disappear as a side effect of tapping it. */
document.addEventListener('pointerdown', (event) => {
  if (event.target instanceof Element && event.target.closest('.nav')) {
    travelled = 0;
    applyVisibility(false);
  }
}, { passive: true });

/* New screens can remount their own .nav. Reapply the current state without
   coupling the behavior to individual React screens. */
const root = document.getElementById('root');
if (root) {
  const observer = new MutationObserver(() => {
    const nav = currentNav();
    if (nav) nav.classList.toggle('nav-smart-hidden', hidden && window.scrollY > TOP_LOCK);
  });
  observer.observe(root, { childList: true, subtree: true });
}
