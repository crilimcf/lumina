import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ErrorBoundary } from './ui.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </React.StrictMode>
);

// Os overlays dos Momentos já suportam arrastar com 1 dedo dentro do editor.
// Esta ponte acrescenta pinch-to-resize com 2 dedos sem duplicar a lógica de
// tamanho: dispara os mesmos controlos acessíveis + / - usados pelo React.
function installMomentOverlayPinchResize() {
  const sessions = new WeakMap();
  const pointerTargets = new Map();
  const STEP_PX = 12;

  const getOverlay = (target) => target?.closest?.('[data-moment-text-overlay], [data-moment-sticker-overlay]') || null;
  const getKind = (overlay) => overlay?.matches?.('[data-moment-text-overlay]') ? 'texto' : 'sticker';
  const gap = (points) => {
    const [a, b] = [...points.values()].slice(0, 2);
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  const onPointerDown = (event) => {
    const overlay = getOverlay(event.target);
    if (!overlay || event.pointerType === 'mouse') return;

    let session = sessions.get(overlay);
    if (!session) {
      session = { pointers: new Map(), pinching: false, suppressUntilRelease: false, lastDistance: 0, carry: 0 };
      sessions.set(overlay, session);
    }

    session.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pointerTargets.set(event.pointerId, overlay);

    if (session.pointers.size === 2) {
      session.pinching = true;
      session.suppressUntilRelease = true;
      session.lastDistance = Math.max(1, gap(session.pointers));
      session.carry = 0;
      // O primeiro dedo já selecionou o overlay no React. O segundo passa a
      // pertencer ao gesto de pinça e não deve reiniciar o drag de 1 dedo.
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const onPointerMove = (event) => {
    const overlay = pointerTargets.get(event.pointerId);
    if (!overlay) return;
    const session = sessions.get(overlay);
    if (!session?.pointers.has(event.pointerId)) return;

    session.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (session.pinching && session.pointers.size >= 2) {
      event.preventDefault();
      event.stopPropagation();

      const nextDistance = Math.max(1, gap(session.pointers));
      session.carry += nextDistance - session.lastDistance;
      session.lastDistance = nextDistance;

      if (Math.abs(session.carry) >= STEP_PX) {
        const direction = session.carry > 0 ? 'Aumentar' : 'Diminuir';
        const label = `${direction} ${getKind(overlay)}`;
        document.querySelector(`button[aria-label="${label}"]`)?.click();
        session.carry = 0;
      }
      return;
    }

    // Depois de uma pinça, ignoramos o dedo que ficou no ecrã até ambos
    // serem levantados. Isto evita um salto brusco de posição ao voltar a drag.
    if (session.suppressUntilRelease) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const onPointerEnd = (event) => {
    const overlay = pointerTargets.get(event.pointerId);
    if (!overlay) return;
    const session = sessions.get(overlay);
    if (!session) return;

    if (session.suppressUntilRelease) {
      event.preventDefault();
      event.stopPropagation();
    }

    session.pointers.delete(event.pointerId);
    pointerTargets.delete(event.pointerId);
    if (session.pointers.size < 2) session.pinching = false;
    if (session.pointers.size === 0) sessions.delete(overlay);
  };

  document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: false });
  document.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
  document.addEventListener('pointerup', onPointerEnd, { capture: true, passive: false });
  document.addEventListener('pointercancel', onPointerEnd, { capture: true, passive: false });
}

installMomentOverlayPinchResize();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const hadControllerAtStart = !!navigator.serviceWorker.controller;
    let refreshing = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Na primeira instalação não há versão antiga para substituir; evitamos
      // um reload desnecessário. Nas atualizações seguintes, recarregamos uma
      // única vez assim que o novo worker assume controlo.
      if (!hadControllerAtStart || refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        const checkForUpdate = () => registration.update().catch(() => {});

        // iOS pode restaurar uma PWA instalada da memória sem uma navegação
        // completa. Verificamos de novo quando a app volta ao primeiro plano.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForUpdate();
        });
        window.addEventListener('focus', checkForUpdate);
        checkForUpdate();
      })
      .catch(() => {});
  });
}
