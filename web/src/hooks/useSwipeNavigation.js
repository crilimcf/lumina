import { useEffect } from 'react';

const MAIN_TABS = ['feed', 'rooms', 'promos', 'dms'];
const MIN_DISTANCE = 72;
const MAX_DURATION = 900;

function startsInInteractiveControl(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select, [contenteditable="true"], video, audio, [data-swipe-ignore="true"]')) return true;

  let node = target;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    const overflowX = style.overflowX;
    if ((overflowX === 'auto' || overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 8) return true;
    node = node.parentElement;
  }
  return false;
}

export function useSwipeNavigation({ enabled, tab, setTab, thread, setThread }) {
  useEffect(() => {
    if (!enabled) return undefined;
    let start = null;

    const onStart = (event) => {
      if (event.touches.length !== 1 || startsInInteractiveControl(event.target)) {
        start = null;
        return;
      }
      const touch = event.touches[0];
      start = { x:touch.clientX, y:touch.clientY, at:performance.now() };
    };

    const onEnd = (event) => {
      if (!start || event.changedTouches.length !== 1) { start = null; return; }
      const touch = event.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const duration = performance.now() - start.at;
      start = null;

      if (duration > MAX_DURATION || Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.35) return;

      // Dentro de uma conversa, o gesto de voltar tem prioridade sobre mudar de aba.
      if (thread) {
        if (dx > 0) setThread(null);
        return;
      }

      const index = MAIN_TABS.indexOf(tab);
      if (index < 0) return;
      if (dx < 0 && index < MAIN_TABS.length - 1) setTab(MAIN_TABS[index + 1]);
      else if (dx > 0 && index > 0) setTab(MAIN_TABS[index - 1]);
    };

    const onCancel = () => { start = null; };
    document.addEventListener('touchstart', onStart, { passive:true });
    document.addEventListener('touchend', onEnd, { passive:true });
    document.addEventListener('touchcancel', onCancel, { passive:true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
    };
  }, [enabled, tab, setTab, thread, setThread]);
}
