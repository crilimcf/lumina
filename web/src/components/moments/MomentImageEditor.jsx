import React, { useEffect, useRef } from 'react';
import { MomentImageEditor as BaseMomentImageEditor } from './MomentImageEditorBase.jsx';

const OVERLAY_SELECTOR = '[data-moment-text-overlay], [data-moment-sticker-overlay]';
const CONTROL_LABELS = new Set([
  'Editar texto', 'Diminuir texto', 'Aumentar texto', 'Apagar texto',
  'Diminuir sticker', 'Aumentar sticker', 'Apagar sticker',
]);

const distance = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

/**
 * Adaptação iOS do editor de Momentos.
 *
 * O editor base continua responsável pelo estado e pela exportação final.
 * Aqui resolvemos duas particularidades de interação observadas no iPhone real:
 * - os controlos + / - não podem deixar o pointerdown chegar ao frame, senão a
 *   seleção é limpa antes do click;
 * - a pinça em overlays usa Touch Events nativos, mais fiáveis em Mobile Safari
 *   para dois dedos no mesmo elemento, e aciona exatamente a mesma lógica + / -.
 */
export function MomentImageEditor(props) {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    let pinch = null;
    let syntheticPointerPinch = null;
    const syntheticPointers = new Map();
    const STEP_PX = 10;

    const overlayOf = (target) => target?.closest?.(OVERLAY_SELECTOR) || null;
    const kindOf = (overlay) => overlay?.matches?.('[data-moment-text-overlay]') ? 'texto' : 'sticker';
    const touchesFor = (event, overlay) => Array.from(event.touches || []).filter((touch) => {
      const targetOverlay = overlayOf(touch.target);
      return targetOverlay === overlay;
    });

    const resizeBy = (overlay, delta) => {
      const kind = kindOf(overlay);
      const direction = delta > 0 ? 'Aumentar' : 'Diminuir';
      const button = root.querySelector(`button[aria-label="${direction} ${kind}"]`);
      button?.click();
    };

    const onTouchStart = (event) => {
      const overlay = overlayOf(event.target);
      if (!overlay) return;
      const touches = touchesFor(event, overlay);
      if (touches.length < 2) return;

      const startDistance = Math.max(1, distance(touches[0], touches[1]));
      pinch = { overlay, lastDistance: startDistance, carry: 0 };
      event.preventDefault();
      event.stopPropagation();
    };

    const onTouchMove = (event) => {
      if (!pinch) return;
      const touches = touchesFor(event, pinch.overlay);
      if (touches.length < 2) return;

      event.preventDefault();
      event.stopPropagation();
      const nextDistance = Math.max(1, distance(touches[0], touches[1]));
      pinch.carry += nextDistance - pinch.lastDistance;
      pinch.lastDistance = nextDistance;

      let guard = 0;
      while (Math.abs(pinch.carry) >= STEP_PX && guard < 8) {
        const direction = pinch.carry > 0 ? 1 : -1;
        resizeBy(pinch.overlay, direction);
        pinch.carry -= direction * STEP_PX;
        guard += 1;
      }
    };

    const onTouchEnd = (event) => {
      if (!pinch) return;
      const touches = touchesFor(event, pinch.overlay);
      if (touches.length >= 2) return;
      event.preventDefault();
      event.stopPropagation();
      pinch = null;
    };


    // Mantemos também uma via PointerEvent para a regressão automatizada e
    // browsers que não expõem TouchEvent. Em iPhone real os eventos são
    // trusted e a via principal continua a ser TouchEvent.
    const onPointerDownCaptureNative = (event) => {
      if (event.isTrusted) return;
      const overlay = overlayOf(event.target);
      if (!overlay) return;
      syntheticPointers.set(event.pointerId, { overlay, x: event.clientX, y: event.clientY });
      const same = [...syntheticPointers.values()].filter(point => point.overlay === overlay);
      if (same.length >= 2) {
        syntheticPointerPinch = {
          overlay,
          lastDistance: Math.max(1, Math.hypot(same[0].x - same[1].x, same[0].y - same[1].y)),
          carry: 0,
        };
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const onPointerMoveSynthetic = (event) => {
      if (event.isTrusted || !syntheticPointers.has(event.pointerId)) return;
      const previous = syntheticPointers.get(event.pointerId);
      syntheticPointers.set(event.pointerId, { ...previous, x: event.clientX, y: event.clientY });
      if (!syntheticPointerPinch || previous.overlay !== syntheticPointerPinch.overlay) return;
      const same = [...syntheticPointers.values()].filter(point => point.overlay === syntheticPointerPinch.overlay);
      if (same.length < 2) return;
      event.preventDefault();
      event.stopPropagation();
      const nextDistance = Math.max(1, Math.hypot(same[0].x - same[1].x, same[0].y - same[1].y));
      syntheticPointerPinch.carry += nextDistance - syntheticPointerPinch.lastDistance;
      syntheticPointerPinch.lastDistance = nextDistance;
      if (Math.abs(syntheticPointerPinch.carry) >= STEP_PX) {
        resizeBy(syntheticPointerPinch.overlay, syntheticPointerPinch.carry > 0 ? 1 : -1);
        syntheticPointerPinch.carry = 0;
      }
    };

    const onPointerEndSynthetic = (event) => {
      if (event.isTrusted) return;
      syntheticPointers.delete(event.pointerId);
      if (syntheticPointers.size < 2) syntheticPointerPinch = null;
    };

    // Depois de a pinça começar, bloqueia o drag PointerEvent do editor base.
    // Sem isto o segundo dedo podia redimensionar e deslocar o elemento ao mesmo tempo.
    const onPointerMoveCapture = (event) => {
      if (!pinch) return;
      if (overlayOf(event.target) !== pinch.overlay) return;
      event.preventDefault();
      event.stopPropagation();
    };

    root.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
    root.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    root.addEventListener('touchend', onTouchEnd, { capture: true, passive: false });
    root.addEventListener('touchcancel', onTouchEnd, { capture: true, passive: false });
    root.addEventListener('pointerdown', onPointerDownCaptureNative, { capture: true, passive: false });
    root.addEventListener('pointermove', onPointerMoveSynthetic, { capture: true, passive: false });
    root.addEventListener('pointerup', onPointerEndSynthetic, { capture: true, passive: false });
    root.addEventListener('pointercancel', onPointerEndSynthetic, { capture: true, passive: false });
    root.addEventListener('pointermove', onPointerMoveCapture, { capture: true, passive: false });

    return () => {
      root.removeEventListener('touchstart', onTouchStart, true);
      root.removeEventListener('touchmove', onTouchMove, true);
      root.removeEventListener('touchend', onTouchEnd, true);
      root.removeEventListener('touchcancel', onTouchEnd, true);
      root.removeEventListener('pointerdown', onPointerDownCaptureNative, true);
      root.removeEventListener('pointermove', onPointerMoveSynthetic, true);
      root.removeEventListener('pointerup', onPointerEndSynthetic, true);
      root.removeEventListener('pointercancel', onPointerEndSynthetic, true);
      root.removeEventListener('pointermove', onPointerMoveCapture, true);
    };
  }, []);

  const protectOverlayControls = (event) => {
    const button = event.target?.closest?.('button[aria-label]');
    if (!button || !CONTROL_LABELS.has(button.getAttribute('aria-label'))) return;

    // O toolbar vive dentro do frame. Se este pointerdown chegar ao frame, o
    // editor base limpa selectedTextId/selectedStickerId antes do onClick.
    // Paramos apenas opointerdown; o click do botão continua a funcionar.
    event.stopPropagation();
  };

  return (
    <div ref={rootRef} onPointerDownCapture={protectOverlayControls} style={{ display: 'contents' }}>
      <BaseMomentImageEditor {...props} />
    </div>
  );
}
