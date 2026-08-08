import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCw, SlidersHorizontal, SmilePlus, Trash2, Undo2, X } from 'lucide-react';

const FRAME_W = 320;
const FRAME_H = 400;
const OUTPUT_W = 1080;
const OUTPUT_H = 1350;
const EMOJIS = ['😂', '😍', '🔥', '❤️', '✨', '🥳', '😎', '🤍', '💯', '🙌', '🌈', '⭐️'];

const limit = (value, min, max) => Math.min(max, Math.max(min, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Editor leve, sem dependências externas, pensado para Mobile Safari.
 * O ficheiro final já sai em 4:5, exatamente como o feed o apresenta.
 */
export function PostImageEditor({ file, onSave, onCancel }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState(null);
  const [saving, setSaving] = useState(false);
  const [stickers, setStickers] = useState([]);
  const [selectedStickerId, setSelectedStickerId] = useState(null);

  const imgRef = useRef(null);
  const imgUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const pointersRef = useRef(new Map());
  const panRef = useRef(null);
  const pinchRef = useRef(null);
  const stickerDragRef = useRef(null);
  const zoomRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => () => URL.revokeObjectURL(imgUrl), [imgUrl]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);

  const sideways = rotation % 180 !== 0;
  const effectiveW = natural ? (sideways ? natural.h : natural.w) : FRAME_W;
  const effectiveH = natural ? (sideways ? natural.w : natural.h) : FRAME_H;
  const baseScale = natural ? Math.max(FRAME_W / effectiveW, FRAME_H / effectiveH) : 1;
  const scale = baseScale * zoom;
  const dispW = effectiveW * scale;
  const dispH = effectiveH * scale;
  const maxX = Math.max(0, (dispW - FRAME_W) / 2);
  const maxY = Math.max(0, (dispH - FRAME_H) / 2);

  const clampOffsetForZoom = (candidate, nextZoom = zoomRef.current) => {
    const nextScale = baseScale * nextZoom;
    const nextMaxX = Math.max(0, (effectiveW * nextScale - FRAME_W) / 2);
    const nextMaxY = Math.max(0, (effectiveH * nextScale - FRAME_H) / 2);
    return {
      x: limit(candidate.x, -nextMaxX, nextMaxX),
      y: limit(candidate.y, -nextMaxY, nextMaxY),
    };
  };

  const setSafeOffset = (candidate, nextZoom = zoomRef.current) => {
    const safe = clampOffsetForZoom(candidate, nextZoom);
    offsetRef.current = safe;
    setOffset(safe);
  };

  useEffect(() => {
    const safe = { x: limit(offset.x, -maxX, maxX), y: limit(offset.y, -maxY, maxY) };
    if (safe.x !== offset.x || safe.y !== offset.y) setSafeOffset(safe, zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxX, maxY]);

  const beginPinch = () => {
    const points = [...pointersRef.current.values()].slice(0, 2);
    if (points.length < 2) return;
    pinchRef.current = {
      startDistance: Math.max(1, distance(points[0], points[1])),
      startMid: midpoint(points[0], points[1]),
      startZoom: zoomRef.current,
      startOffset: { ...offsetRef.current },
    };
    panRef.current = null;
  };

  const onPointerDown = (event) => {
    if (event.target.closest?.('[data-photo-sticker]')) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* Safari/synthetic pointer */ }

    if (pointersRef.current.size >= 2) {
      beginPinch();
    } else {
      panRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startOffset: { ...offsetRef.current },
      };
    }
  };

  const onPointerMove = (event) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size >= 2) {
      if (!pinchRef.current) beginPinch();
      const points = [...pointersRef.current.values()].slice(0, 2);
      const pinch = pinchRef.current;
      if (!pinch) return;

      const nextZoom = limit(pinch.startZoom * (distance(points[0], points[1]) / pinch.startDistance), 1, 3.5);
      const mid = midpoint(points[0], points[1]);
      const candidateOffset = {
        x: pinch.startOffset.x + (mid.x - pinch.startMid.x),
        y: pinch.startOffset.y + (mid.y - pinch.startMid.y),
      };
      zoomRef.current = nextZoom;
      setZoom(nextZoom);
      setSafeOffset(candidateOffset, nextZoom);
      return;
    }

    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    setSafeOffset({
      x: pan.startOffset.x + (event.clientX - pan.startX),
      y: pan.startOffset.y + (event.clientY - pan.startY),
    });
  };

  const onPointerEnd = (event) => {
    pointersRef.current.delete(event.pointerId);
    pinchRef.current = null;

    const remaining = [...pointersRef.current.entries()][0];
    if (remaining) {
      panRef.current = {
        pointerId: remaining[0],
        startX: remaining[1].x,
        startY: remaining[1].y,
        startOffset: { ...offsetRef.current },
      };
    } else {
      panRef.current = null;
    }
  };

  const rotate = () => {
    setRotation(value => (value + 90) % 360);
    setSafeOffset({ x: 0, y: 0 }, zoomRef.current);
  };

  const reset = () => {
    zoomRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
    setZoom(1);
    setRotation(0);
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setOffset({ x: 0, y: 0 });
  };

  const addSticker = (emoji) => {
    const id = `${Date.now()}-${Math.random()}`;
    const spread = (stickers.length % 4) * 12;
    const sticker = { id, emoji, x: FRAME_W / 2 + spread - 18, y: FRAME_H / 2 + spread - 18, size: 54 };
    setStickers(current => [...current, sticker]);
    setSelectedStickerId(id);
  };

  const updateSticker = (id, patch) => {
    setStickers(current => current.map(sticker => {
      if (sticker.id !== id) return sticker;
      const next = { ...sticker, ...patch };
      const half = next.size / 2;
      next.x = limit(next.x, half, FRAME_W - half);
      next.y = limit(next.y, half, FRAME_H - half);
      return next;
    }));
  };

  const startStickerDrag = (event, sticker) => {
    event.stopPropagation();
    setSelectedStickerId(sticker.id);
    stickerDragRef.current = {
      id: sticker.id,
      startX: event.clientX,
      startY: event.clientY,
      x: sticker.x,
      y: sticker.y,
    };
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* noop */ }
  };

  const moveSticker = (event) => {
    const drag = stickerDragRef.current;
    if (!drag) return;
    event.stopPropagation();
    updateSticker(drag.id, {
      x: drag.x + (event.clientX - drag.startX),
      y: drag.y + (event.clientY - drag.startY),
    });
  };

  const stopStickerDrag = (event) => {
    event?.stopPropagation?.();
    stickerDragRef.current = null;
  };

  const removeSelectedSticker = () => {
    if (!selectedStickerId) return;
    setStickers(current => current.filter(sticker => sticker.id !== selectedStickerId));
    setSelectedStickerId(null);
  };

  const selectedSticker = stickers.find(sticker => sticker.id === selectedStickerId) || null;

  const save = () => {
    if (!natural || !imgRef.current || saving) return;
    setSaving(true);

    const rotated = document.createElement('canvas');
    rotated.width = effectiveW;
    rotated.height = effectiveH;
    const rctx = rotated.getContext('2d');
    rctx.save();
    rctx.translate(effectiveW / 2, effectiveH / 2);
    rctx.rotate((rotation * Math.PI) / 180);
    rctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    rctx.drawImage(imgRef.current, -natural.w / 2, -natural.h / 2, natural.w, natural.h);
    rctx.restore();

    const finalScale = baseScale * zoomRef.current;
    const finalDispW = effectiveW * finalScale;
    const finalDispH = effectiveH * finalScale;
    const finalOffset = offsetRef.current;
    const sx = ((finalDispW - FRAME_W) / 2 - finalOffset.x) / finalScale;
    const sy = ((finalDispH - FRAME_H) / 2 - finalOffset.y) / finalScale;
    const sw = FRAME_W / finalScale;
    const sh = FRAME_H / finalScale;

    const output = document.createElement('canvas');
    output.width = OUTPUT_W;
    output.height = OUTPUT_H;
    const ctx = output.getContext('2d');
    ctx.drawImage(rotated, sx, sy, sw, sh, 0, 0, OUTPUT_W, OUTPUT_H);

    // Os stickers são desenhados depois do recorte para saírem exatamente onde
    // aparecem na moldura, independentemente do zoom/rotação da fotografia.
    const stickerScale = OUTPUT_W / FRAME_W;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    stickers.forEach(sticker => {
      ctx.font = `${Math.round(sticker.size * stickerScale)}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.fillText(sticker.emoji, sticker.x * stickerScale, sticker.y * stickerScale);
    });

    output.toBlob((blob) => {
      setSaving(false);
      if (!blob) return;
      onSave(new File([blob], `lumina-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  };

  const filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(10,8,26,.92)', color: '#fff',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div className="in" style={{
        width: '100%', maxWidth: 430, maxHeight: '100dvh', overflowY: 'auto',
        padding: '18px 18px calc(22px + env(safe-area-inset-bottom))',
        background: '#141126', borderRadius: '28px 28px 0 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div className="d" style={{ fontSize: 25, color: '#fff' }}>Editar foto</div>
            <div style={{ fontSize: 12, opacity: .58, marginTop: 3 }}>1 dedo move · 2 dedos aproximam · formato 4:5</div>
          </div>
          <button className="p" onClick={onCancel} aria-label="Fechar editor"
            style={{ padding: 10, background: 'rgba(255,255,255,.1)', color: '#fff', borderColor: 'transparent' }}>
            <X size={17} />
          </button>
        </div>

        <div
          data-testid="photo-frame"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          style={{
            width: FRAME_W, height: FRAME_H, maxWidth: '100%', margin: '0 auto 14px',
            position: 'relative', overflow: 'hidden', borderRadius: 22,
            background: '#05040A', touchAction: 'none', cursor: 'grab',
            boxShadow: '0 18px 50px rgba(0,0,0,.34)',
          }}>
          <div style={{
            position: 'absolute', left: '50%', top: '50%', width: dispW, height: dispH,
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
          }}>
            <img
              ref={(node) => {
                imgRef.current = node;
                if (node?.complete && node.naturalWidth > 0) {
                  setNatural(current => current || { w: node.naturalWidth, h: node.naturalHeight });
                }
              }}
              src={imgUrl}
              alt="Foto a editar"
              draggable={false}
              onLoad={(event) => setNatural({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })}
              style={{
                position: 'absolute', left: '50%', top: '50%',
                width: natural ? natural.w * scale : FRAME_W,
                height: natural ? natural.h * scale : FRAME_H,
                maxWidth: 'none', userSelect: 'none', pointerEvents: 'none', filter,
                transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
              }} />
          </div>

          {[1, 2].map(n => <span key={`v${n}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${n * 33.333}%`, width: 1, background: 'rgba(255,255,255,.22)', pointerEvents: 'none' }} />)}
          {[1, 2].map(n => <span key={`h${n}`} style={{ position: 'absolute', left: 0, right: 0, top: `${n * 33.333}%`, height: 1, background: 'rgba(255,255,255,.22)', pointerEvents: 'none' }} />)}

          <div data-testid="photo-zoom-readout" style={{
            position: 'absolute', top: 10, left: 10, pointerEvents: 'none',
            padding: '5px 8px', borderRadius: 999, background: 'rgba(0,0,0,.45)',
            backdropFilter: 'blur(8px)', fontSize: 11, fontWeight: 700,
          }}>{Math.round(zoom * 100)}%</div>

          {stickers.map(sticker => (
            <button key={sticker.id} type="button" data-photo-sticker data-testid="photo-sticker"
              aria-label={`Emoji ${sticker.emoji}`}
              onPointerDown={event => startStickerDrag(event, sticker)}
              onPointerMove={moveSticker}
              onPointerUp={stopStickerDrag}
              onPointerCancel={stopStickerDrag}
              style={{
                position: 'absolute', left: sticker.x, top: sticker.y,
                width: sticker.size + 16, height: sticker.size + 16,
                transform: 'translate(-50%, -50%)', padding: 0, borderRadius: 14,
                border: selectedStickerId === sticker.id ? '2px solid rgba(255,255,255,.9)' : '2px solid transparent',
                background: selectedStickerId === sticker.id ? 'rgba(20,17,38,.2)' : 'transparent',
                display: 'grid', placeItems: 'center', cursor: 'grab', touchAction: 'none', zIndex: 5,
                fontSize: sticker.size, lineHeight: 1, fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", sans-serif',
              }}>
              {sticker.emoji}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 9, marginBottom: 12 }}>
          <button className="p" onClick={rotate} style={{ flex: 1, color: '#fff', background: 'rgba(255,255,255,.08)', borderColor: 'transparent' }}>
            <RotateCw size={15} /> Rodar
          </button>
          <button className="p" onClick={reset} style={{ flex: 1, color: '#fff', background: 'rgba(255,255,255,.08)', borderColor: 'transparent' }}>
            <Undo2 size={15} /> Repor foto
          </button>
        </div>

        <div style={{ background: 'rgba(255,255,255,.07)', borderRadius: 20, padding: '13px 14px 8px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, marginBottom: 10, opacity: .8 }}>
            <SmilePlus size={14} /> DECORAR
          </div>
          <div className="ns" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
            {EMOJIS.map(emoji => (
              <button type="button" key={emoji} aria-label={`Adicionar emoji ${emoji}`} onClick={() => addSticker(emoji)}
                style={{ width: 42, height: 42, flex: '0 0 42px', border: 0, borderRadius: 13, background: 'rgba(255,255,255,.09)', fontSize: 23, cursor: 'pointer' }}>
                {emoji}
              </button>
            ))}
          </div>

          {selectedSticker && (
            <div style={{ display: 'grid', gridTemplateColumns: '68px 1fr 40px', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 12, opacity: .68 }}>Tamanho</span>
              <input aria-label="Tamanho do emoji" type="range" min="28" max="96" step="1" value={selectedSticker.size}
                onChange={event => updateSticker(selectedSticker.id, { size: Number(event.target.value) })}
                style={{ width: '100%', accentColor: 'var(--coral)' }} />
              <button type="button" onClick={removeSelectedSticker} aria-label="Remover emoji"
                style={{ width: 36, height: 36, border: 0, borderRadius: 11, background: 'rgba(255,84,66,.15)', color: '#FF8174', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                <Trash2 size={15} />
              </button>
            </div>
          )}
        </div>

        <div style={{ background: 'rgba(255,255,255,.07)', borderRadius: 20, padding: '13px 14px 6px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, marginBottom: 9, opacity: .8 }}>
            <SlidersHorizontal size={14} /> AJUSTES
          </div>
          {[
            ['Brilho', brightness, 60, 140, 1, setBrightness, value => `${value}%`],
            ['Contraste', contrast, 60, 140, 1, setContrast, value => `${value}%`],
            ['Saturação', saturation, 0, 180, 1, setSaturation, value => `${value}%`],
          ].map(([label, value, min, max, step, setter, format]) => (
            <label key={label} style={{ display: 'grid', gridTemplateColumns: '76px 1fr 45px', alignItems: 'center', gap: 8, marginBottom: 9, fontSize: 12 }}>
              <span style={{ opacity: .7 }}>{label}</span>
              <input aria-label={label} type="range" min={min} max={max} step={step} value={value}
                onChange={event => setter(Number(event.target.value))}
                style={{ width: '100%', accentColor: 'var(--coral)' }} />
              <span style={{ textAlign: 'right', opacity: .72, fontVariantNumeric: 'tabular-nums' }}>{format(value)}</span>
            </label>
          ))}
        </div>

        <button className="p p-cr" onClick={save} disabled={!natural || saving}
          style={{ width: '100%', padding: 15, fontSize: 15 }}>
          {saving ? 'A preparar…' : 'Usar esta foto'}
        </button>
      </div>
    </div>
  );
}
