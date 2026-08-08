import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCw, SlidersHorizontal, Trash2, Type, Undo2, X } from 'lucide-react';

const FRAME_W = 320;
const FRAME_H = 569;
const OUTPUT_W = 1080;
const OUTPUT_H = 1920;

const limit = (value, min, max) => Math.min(max, Math.max(min, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function roundedRect(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapLines(ctx, value, maxWidth) {
  const paragraphs = String(value || '').split('\n');
  const lines = [];
  paragraphs.forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      return;
    }
    let line = '';
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });
    if (line) lines.push(line);
  });
  return lines.slice(0, 8);
}

function TextOverlay({ item, selected, onSelect, onMove, onStop }) {
  return (
    <div
      data-moment-text-overlay
      onPointerDown={(event) => onSelect(event, item)}
      onPointerMove={onMove}
      onPointerUp={onStop}
      onPointerCancel={onStop}
      style={{
        position: 'absolute', left: item.x, top: item.y, transform: 'translate(-50%, -50%)',
        maxWidth: '86%', padding: item.style === 'clean' ? '4px 7px' : '7px 11px',
        borderRadius: 12, cursor: 'grab', touchAction: 'none', userSelect: 'none',
        color: item.style === 'highlight' ? '#111018' : '#fff',
        background: item.style === 'highlight' ? 'rgba(255,255,255,.94)' : item.style === 'dark' ? 'rgba(10,8,20,.72)' : 'transparent',
        textShadow: item.style === 'clean' ? '0 2px 9px rgba(0,0,0,.82)' : 'none',
        fontSize: item.size, fontWeight: 800, lineHeight: 1.08, textAlign: 'center',
        whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
        outline: selected ? '2px solid rgba(255,255,255,.92)' : '2px solid transparent',
        outlineOffset: 3, zIndex: 4,
      }}>
      {item.text}
    </div>
  );
}

/** Editor vertical para Momentos: foto 9:16 + texto arrastável. */
export function MomentImageEditor({ file, onSave, onCancel }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState(null);
  const [saving, setSaving] = useState(false);
  const [texts, setTexts] = useState([]);
  const [selectedTextId, setSelectedTextId] = useState(null);
  const [draftText, setDraftText] = useState('');
  const [draftStyle, setDraftStyle] = useState('clean');
  const [draftSize, setDraftSize] = useState(32);

  const imgRef = useRef(null);
  const imgUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const pointersRef = useRef(new Map());
  const panRef = useRef(null);
  const pinchRef = useRef(null);
  const textDragRef = useRef(null);
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
    if (event.target.closest?.('[data-moment-text-overlay]')) return;
    setSelectedTextId(null);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* Safari */ }
    if (pointersRef.current.size >= 2) beginPinch();
    else {
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
      zoomRef.current = nextZoom;
      setZoom(nextZoom);
      setSafeOffset({
        x: pinch.startOffset.x + (mid.x - pinch.startMid.x),
        y: pinch.startOffset.y + (mid.y - pinch.startMid.y),
      }, nextZoom);
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
    } else panRef.current = null;
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

  const saveText = () => {
    const clean = draftText.trim();
    if (!clean) return;
    if (selectedTextId) {
      setTexts(current => current.map(item => item.id === selectedTextId
        ? { ...item, text: clean, style: draftStyle, size: draftSize }
        : item));
    } else {
      const id = `${Date.now()}-${Math.random()}`;
      setTexts(current => [...current, {
        id, text: clean, style: draftStyle, size: draftSize,
        x: FRAME_W / 2, y: FRAME_H * (0.38 + Math.min(current.length, 3) * 0.1),
      }]);
      setSelectedTextId(id);
    }
  };

  const selectText = (event, item) => {
    event.stopPropagation();
    setSelectedTextId(item.id);
    setDraftText(item.text);
    setDraftStyle(item.style);
    setDraftSize(item.size);
    textDragRef.current = {
      id: item.id,
      startX: event.clientX,
      startY: event.clientY,
      x: item.x,
      y: item.y,
    };
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* Safari */ }
  };

  const moveText = (event) => {
    const drag = textDragRef.current;
    if (!drag) return;
    event.stopPropagation();
    const x = limit(drag.x + (event.clientX - drag.startX), 36, FRAME_W - 36);
    const y = limit(drag.y + (event.clientY - drag.startY), 36, FRAME_H - 36);
    setTexts(current => current.map(item => item.id === drag.id ? { ...item, x, y } : item));
  };

  const stopText = (event) => {
    event?.stopPropagation?.();
    textDragRef.current = null;
  };

  const updateSelectedStyle = (style) => {
    setDraftStyle(style);
    if (selectedTextId) setTexts(current => current.map(item => item.id === selectedTextId ? { ...item, style } : item));
  };

  const updateSelectedSize = (size) => {
    setDraftSize(size);
    if (selectedTextId) setTexts(current => current.map(item => item.id === selectedTextId ? { ...item, size } : item));
  };

  const removeSelectedText = () => {
    if (!selectedTextId) return;
    setTexts(current => current.filter(item => item.id !== selectedTextId));
    setSelectedTextId(null);
    setDraftText('');
  };

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

    const textScale = OUTPUT_W / FRAME_W;
    texts.forEach((item) => {
      const fontSize = Math.round(item.size * textScale);
      const lineHeight = Math.round(fontSize * 1.1);
      ctx.font = `800 ${fontSize}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = wrapLines(ctx, item.text, OUTPUT_W * 0.82);
      const centerX = item.x * textScale;
      const centerY = item.y * (OUTPUT_H / FRAME_H);
      const startY = centerY - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((line, index) => {
        const y = startY + index * lineHeight;
        const width = Math.min(OUTPUT_W * 0.86, ctx.measureText(line || ' ').width + fontSize * 0.62);
        if (item.style !== 'clean') {
          ctx.save();
          ctx.fillStyle = item.style === 'highlight' ? 'rgba(255,255,255,.94)' : 'rgba(10,8,20,.72)';
          roundedRect(ctx, centerX - width / 2, y - lineHeight * 0.48, width, lineHeight * 0.96, fontSize * 0.2);
          ctx.fill();
          ctx.restore();
        }
        ctx.save();
        ctx.fillStyle = item.style === 'highlight' ? '#111018' : '#FFFFFF';
        if (item.style === 'clean') {
          ctx.shadowColor = 'rgba(0,0,0,.72)';
          ctx.shadowBlur = Math.max(8, fontSize * 0.16);
          ctx.shadowOffsetY = Math.max(2, fontSize * 0.035);
        }
        ctx.fillText(line, centerX, y);
        ctx.restore();
      });
    });

    output.toBlob((blob) => {
      setSaving(false);
      if (!blob) return;
      onSave(new File([blob], `lumina-momento-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  };

  const filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 110, background: '#080711', color: '#fff', overflowY: 'auto' }}>
      <div style={{ width: '100%', maxWidth: 430, minHeight: '100dvh', margin: '0 auto', padding: '14px 14px calc(20px + env(safe-area-inset-bottom))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div className="d" style={{ fontSize: 24, color: '#fff' }}>Editar momento</div>
            <div style={{ fontSize: 11.5, opacity: .62, marginTop: 2 }}>1 dedo move · 2 dedos aproximam · 9:16</div>
          </div>
          <button className="p" onClick={onCancel} aria-label="Fechar editor de momento"
            style={{ padding: 10, background: 'rgba(255,255,255,.1)', color: '#fff', borderColor: 'transparent' }}><X size={17} /></button>
        </div>

        <div
          data-testid="moment-photo-frame"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          style={{
            width: FRAME_W, height: FRAME_H, maxWidth: '100%', margin: '0 auto 12px', position: 'relative', overflow: 'hidden',
            borderRadius: 24, background: '#05040A', touchAction: 'none', boxShadow: '0 20px 54px rgba(0,0,0,.42)',
          }}>
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: dispW, height: dispH, transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))` }}>
            <img
              ref={(node) => {
                imgRef.current = node;
                if (node?.complete && node.naturalWidth > 0) setNatural(current => current || { w: node.naturalWidth, h: node.naturalHeight });
              }}
              src={imgUrl}
              alt="Foto do momento a editar"
              draggable={false}
              onLoad={(event) => setNatural({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })}
              style={{
                position: 'absolute', left: '50%', top: '50%', width: natural ? natural.w * scale : FRAME_W,
                height: natural ? natural.h * scale : FRAME_H, maxWidth: 'none', userSelect: 'none', pointerEvents: 'none', filter,
                transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
              }} />
          </div>
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg,rgba(0,0,0,.12),transparent 20%,transparent 76%,rgba(0,0,0,.18))' }} />
          {texts.map(item => (
            <TextOverlay key={item.id} item={item} selected={item.id === selectedTextId}
              onSelect={selectText} onMove={moveText} onStop={stopText} />
          ))}
          <div data-testid="moment-photo-zoom-readout" style={{ position: 'absolute', top: 11, left: 11, zIndex: 5, padding: '6px 9px', borderRadius: 999, background: 'rgba(0,0,0,.5)', fontSize: 10.5, fontWeight: 700 }}>
            {Math.round(zoom * 100)}%
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button type="button" className="p" onClick={rotate} style={{ flex: 1, justifyContent: 'center', background: 'rgba(255,255,255,.09)', color: '#fff', borderColor: 'transparent' }}>
            <RotateCw size={15} /> Rodar
          </button>
          <button type="button" className="p" onClick={reset} style={{ flex: 1, justifyContent: 'center', background: 'rgba(255,255,255,.09)', color: '#fff', borderColor: 'transparent' }}>
            <Undo2 size={15} /> Repor foto
          </button>
        </div>

        <div style={{ padding: 12, borderRadius: 18, background: 'rgba(255,255,255,.07)', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9, fontSize: 12, fontWeight: 700 }}><Type size={15} /> Texto sobre a foto</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <textarea aria-label="Texto do momento" placeholder="Escreve sobre a foto…" value={draftText}
              onChange={event => setDraftText(event.target.value)} maxLength={180} rows={2}
              style={{ minHeight: 62, resize: 'none', background: 'rgba(255,255,255,.95)', color: '#171425' }} />
            <button type="button" className="p p-brand" onClick={saveText} disabled={!draftText.trim()}
              style={{ alignSelf: 'stretch', padding: '10px 13px' }}>{selectedTextId ? 'Atualizar' : 'Adicionar'}</button>
          </div>
          <div style={{ display: 'flex', gap: 7, marginTop: 9, overflowX: 'auto' }}>
            {[['clean', 'Livre'], ['highlight', 'Claro'], ['dark', 'Escuro']].map(([value, label]) => (
              <button key={value} type="button" className="p p-sm" onClick={() => updateSelectedStyle(value)}
                aria-pressed={draftStyle === value}
                style={{ flexShrink: 0, background: draftStyle === value ? '#fff' : 'rgba(255,255,255,.08)', color: draftStyle === value ? '#171425' : '#fff', borderColor: 'transparent' }}>{label}</button>
            ))}
            {selectedTextId && (
              <button type="button" className="p p-sm" onClick={removeSelectedText}
                style={{ marginLeft: 'auto', color: '#FF7A70', background: 'rgba(255,255,255,.08)', borderColor: 'transparent' }}>
                <Trash2 size={13} /> Apagar
              </button>
            )}
          </div>
          <label style={{ display: 'grid', gridTemplateColumns: '72px 1fr 34px', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 11.5, opacity: .9 }}>
            Tamanho
            <input aria-label="Tamanho do texto" type="range" min="22" max="54" value={draftSize}
              onChange={event => updateSelectedSize(Number(event.target.value))} />
            <span>{draftSize}</span>
          </label>
          <div style={{ fontSize: 10.5, opacity: .55, marginTop: 7 }}>Toca no texto para o editar · arrasta-o diretamente sobre a foto · emojis também funcionam.</div>
        </div>

        <details style={{ padding: '0 2px', marginBottom: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, opacity: .8, display: 'flex', alignItems: 'center', gap: 7 }}>
            <SlidersHorizontal size={14} /> Ajustar imagem
          </summary>
          <div style={{ display: 'grid', gap: 8, marginTop: 9 }}>
            {[['Brilho', brightness, setBrightness, 65, 145], ['Contraste', contrast, setContrast, 65, 145], ['Saturação', saturation, setSaturation, 0, 180]].map(([label, value, setter, min, max]) => (
              <label key={label} style={{ display: 'grid', gridTemplateColumns: '72px 1fr 38px', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                {label}
                <input aria-label={label} type="range" min={min} max={max} value={value} onChange={event => setter(Number(event.target.value))} />
                <span style={{ textAlign: 'right', opacity: .72 }}>{value}</span>
              </label>
            ))}
          </div>
        </details>

        <button type="button" className="p p-brand" onClick={save} disabled={!natural || saving}
          style={{ width: '100%', padding: 15, fontSize: 15 }}>
          {saving ? 'A preparar…' : 'Usar no momento'}
        </button>
      </div>
    </div>
  );
}
