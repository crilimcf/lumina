import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCw, SlidersHorizontal, Undo2, X } from 'lucide-react';

const FRAME_W = 320;
const FRAME_H = 400;
const OUTPUT_W = 1080;
const OUTPUT_H = 1350;

const clamp = (value, max) => Math.min(max, Math.max(-max, value));

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
  const imgRef = useRef(null);
  const dragRef = useRef(null);
  const imgUrl = useMemo(() => URL.createObjectURL(file), [file]);

  useEffect(() => () => URL.revokeObjectURL(imgUrl), [imgUrl]);

  const sideways = rotation % 180 !== 0;
  const effectiveW = natural ? (sideways ? natural.h : natural.w) : FRAME_W;
  const effectiveH = natural ? (sideways ? natural.w : natural.h) : FRAME_H;
  const baseScale = natural ? Math.max(FRAME_W / effectiveW, FRAME_H / effectiveH) : 1;
  const scale = baseScale * zoom;
  const dispW = effectiveW * scale;
  const dispH = effectiveH * scale;
  const maxX = Math.max(0, (dispW - FRAME_W) / 2);
  const maxY = Math.max(0, (dispH - FRAME_H) / 2);

  useEffect(() => {
    setOffset(current => ({ x: clamp(current.x, maxX), y: clamp(current.y, maxY) }));
  }, [maxX, maxY]);

  const onPointerDown = (event) => {
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      offX: offset.x,
      offY: offset.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    setOffset({
      x: clamp(dragRef.current.offX + dx, maxX),
      y: clamp(dragRef.current.offY + dy, maxY),
    });
  };

  const stopDragging = () => { dragRef.current = null; };

  const rotate = () => {
    setRotation(value => (value + 90) % 360);
    setOffset({ x: 0, y: 0 });
  };

  const reset = () => {
    setZoom(1);
    setRotation(0);
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setOffset({ x: 0, y: 0 });
  };

  const save = () => {
    if (!natural || !imgRef.current || saving) return;
    setSaving(true);

    // Primeiro criamos uma versão da imagem já rodada e com os ajustes visuais.
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

    // Depois recortamos exatamente a área que a pessoa vê dentro da moldura 4:5.
    const sx = ((dispW - FRAME_W) / 2 - offset.x) / scale;
    const sy = ((dispH - FRAME_H) / 2 - offset.y) / scale;
    const sw = FRAME_W / scale;
    const sh = FRAME_H / scale;

    const output = document.createElement('canvas');
    output.width = OUTPUT_W;
    output.height = OUTPUT_H;
    const ctx = output.getContext('2d');
    ctx.drawImage(rotated, sx, sy, sw, sh, 0, 0, OUTPUT_W, OUTPUT_H);
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
            <div style={{ fontSize: 12, opacity: .58, marginTop: 3 }}>Arrasta para enquadrar · formato 4:5</div>
          </div>
          <button className="p" onClick={onCancel} aria-label="Fechar editor"
            style={{ padding: 10, background: 'rgba(255,255,255,.1)', color: '#fff', borderColor: 'transparent' }}>
            <X size={17} />
          </button>
        </div>

        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          onPointerLeave={stopDragging}
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

          {/* Grelha discreta de composição. */}
          {[1, 2].map(n => <span key={`v${n}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${n * 33.333}%`, width: 1, background: 'rgba(255,255,255,.26)', pointerEvents: 'none' }} />)}
          {[1, 2].map(n => <span key={`h${n}`} style={{ position: 'absolute', left: 0, right: 0, top: `${n * 33.333}%`, height: 1, background: 'rgba(255,255,255,.26)', pointerEvents: 'none' }} />)}
        </div>

        <div style={{ display: 'flex', gap: 9, marginBottom: 14 }}>
          <button className="p" onClick={rotate} style={{ flex: 1, color: '#fff', background: 'rgba(255,255,255,.08)', borderColor: 'transparent' }}>
            <RotateCw size={15} /> Rodar
          </button>
          <button className="p" onClick={reset} style={{ flex: 1, color: '#fff', background: 'rgba(255,255,255,.08)', borderColor: 'transparent' }}>
            <Undo2 size={15} /> Repor
          </button>
        </div>

        <div style={{ background: 'rgba(255,255,255,.07)', borderRadius: 20, padding: '13px 14px 6px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, marginBottom: 9, opacity: .8 }}>
            <SlidersHorizontal size={14} /> AJUSTES
          </div>
          {[
            ['Zoom', zoom, 1, 3, .01, setZoom, value => `${Math.round(value * 100)}%`],
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
