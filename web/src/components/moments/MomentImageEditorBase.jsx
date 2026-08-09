import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, RotateCw, SlidersHorizontal, Trash2, Undo2, X } from 'lucide-react';

const FRAME_W = 320;
const FRAME_H = 569;
const OUTPUT_W = 1080;
const OUTPUT_H = 1920;

const TEXT_COLORS = [
  ['Branco', '#FFFFFF'], ['Preto', '#111018'], ['Amarelo', '#FFE45C'], ['Laranja', '#FF9B42'],
  ['Vermelho', '#FF5B57'], ['Rosa', '#FF6FC8'], ['Roxo', '#9B7BFF'], ['Azul', '#5F8CFF'],
  ['Ciano', '#58E3F2'], ['Verde', '#5FE09D'],
];

const DRAW_COLORS = TEXT_COLORS;

const EMOJIS = [
  '😂', '❤️', '🔥', '✨', '😍', '🥰', '😎', '🥳', '🤍', '⭐️', '🎉', '🙌',
  '🫶', '💯', '🌙', '☀️', '🌊', '🍀', '⚡️', '💫', '💜', '💙', '💚', '🧡',
  '💛', '🤩', '😜', '🤪', '🥹', '🤭', '🦋', '🌸', '🌈', '🍾', '🎂', '🎵',
];

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

function isDarkColor(hex) {
  const value = String(hex || '#FFFFFF').replace('#', '');
  if (value.length !== 6) return false;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) < 145;
}

function effectStroke(color) {
  return isDarkColor(color) ? 'rgba(255,255,255,.92)' : 'rgba(0,0,0,.82)';
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
        color: item.color || '#FFFFFF',
        background: item.style === 'highlight' ? 'rgba(255,255,255,.94)' : item.style === 'dark' ? 'rgba(10,8,20,.74)' : 'transparent',
        textShadow: item.effect === 'shadow' ? '0 3px 12px rgba(0,0,0,.78)' : 'none',
        WebkitTextStroke: item.effect === 'outline' ? `1px ${effectStroke(item.color)}` : '0 transparent',
        paintOrder: 'stroke fill',
        fontSize: item.size, fontWeight: 800, lineHeight: 1.08, textAlign: 'center',
        whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
        outline: selected ? '2px solid rgba(255,255,255,.92)' : '2px solid transparent',
        outlineOffset: 3, zIndex: 4,
      }}>
      {item.text}
    </div>
  );
}

function StickerOverlay({ item, selected, onSelect, onMove, onStop }) {
  return (
    <div
      data-moment-sticker-overlay
      onPointerDown={(event) => onSelect(event, item)}
      onPointerMove={onMove}
      onPointerUp={onStop}
      onPointerCancel={onStop}
      style={{
        position: 'absolute', left: item.x, top: item.y, transform: 'translate(-50%, -50%)',
        fontSize: item.size, lineHeight: 1, cursor: 'grab', touchAction: 'none', userSelect: 'none',
        filter: 'drop-shadow(0 4px 10px rgba(0,0,0,.28))',
        outline: selected ? '2px solid rgba(255,255,255,.94)' : '2px solid transparent',
        outlineOffset: 5, borderRadius: 12, zIndex: 4,
      }}>
      {item.emoji}
    </div>
  );
}

function ColorStrip({ colors, value, onChange, prefix }) {
  return (
    <div style={{ display: 'flex', gap: 9, overflowX: 'auto', padding: '2px 2px 5px', WebkitOverflowScrolling: 'touch' }}>
      {colors.map(([name, color]) => (
        <button
          key={`${prefix}-${name}`}
          type="button"
          aria-label={`${prefix} ${name}`}
          aria-pressed={value === color}
          onClick={() => onChange(color)}
          style={{
            width: 31, height: 31, minWidth: 31, borderRadius: 99, padding: 0,
            background: color, border: value === color ? '3px solid #fff' : '2px solid rgba(255,255,255,.28)',
            boxShadow: value === color ? '0 0 0 2px rgba(126,107,255,.9)' : 'none',
          }}
        />
      ))}
    </div>
  );
}

/** Editor vertical de Momentos: foto 9:16 + texto, stickers e desenho livre. */
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
  const [stickers, setStickers] = useState([]);
  const [strokes, setStrokes] = useState([]);
  const [selectedTextId, setSelectedTextId] = useState(null);
  const [selectedStickerId, setSelectedStickerId] = useState(null);
  const [draftText, setDraftText] = useState('');
  const [draftStyle, setDraftStyle] = useState('clean');
  const [draftSize, setDraftSize] = useState(32);
  const [draftColor, setDraftColor] = useState('#FFFFFF');
  const [draftEffect, setDraftEffect] = useState('shadow');
  const [drawColor, setDrawColor] = useState('#FFFFFF');
  const [drawSize, setDrawSize] = useState(5);
  const [activeTool, setActiveTool] = useState(null);

  const imgRef = useRef(null);
  const textInputRef = useRef(null);
  const imgUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const pointersRef = useRef(new Map());
  const panRef = useRef(null);
  const pinchRef = useRef(null);
  const textDragRef = useRef(null);
  const stickerDragRef = useRef(null);
  const drawRef = useRef(null);
  const zoomRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => () => URL.revokeObjectURL(imgUrl), [imgUrl]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);
  useEffect(() => {
    if (activeTool !== 'text') return;
    const timer = setTimeout(() => textInputRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [activeTool]);

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

  const framePoint = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: limit((event.clientX - rect.left) * (FRAME_W / rect.width), 0, FRAME_W),
      y: limit((event.clientY - rect.top) * (FRAME_H / rect.height), 0, FRAME_H),
    };
  };

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
    if (event.target.closest?.('[data-moment-text-overlay], [data-moment-sticker-overlay], [data-moment-draw-controls]')) return;
    setSelectedTextId(null);
    setSelectedStickerId(null);

    if (activeTool === 'draw') {
      event.preventDefault();
      const id = `${Date.now()}-${Math.random()}`;
      const point = framePoint(event);
      drawRef.current = { id, pointerId: event.pointerId };
      setStrokes(current => [...current, { id, color: drawColor, size: drawSize, points: [point] }]);
      try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* Safari */ }
      return;
    }

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
    if (activeTool === 'draw') {
      const active = drawRef.current;
      if (!active || active.pointerId !== event.pointerId) return;
      event.preventDefault();
      const point = framePoint(event);
      setStrokes(current => current.map(stroke => stroke.id === active.id
        ? { ...stroke, points: [...stroke.points, point] }
        : stroke));
      return;
    }

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
    if (activeTool === 'draw') {
      if (drawRef.current?.pointerId === event.pointerId) drawRef.current = null;
      return;
    }
    pointersRef.current.delete(event.pointerId);
    pinchRef.current = null;
    const remaining = [...pointersRef.current.entries()][0];
    if (remaining) {
      panRef.current = {
        pointerId: remaining[0], startX: remaining[1].x, startY: remaining[1].y,
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

  const openTextTool = () => {
    if (!selectedTextId) {
      setDraftText('');
      setDraftStyle('clean');
      setDraftSize(32);
      setDraftColor('#FFFFFF');
      setDraftEffect('shadow');
    }
    setSelectedStickerId(null);
    setActiveTool('text');
  };

  const saveText = () => {
    const clean = draftText.trim();
    if (!clean) return;
    if (selectedTextId) {
      setTexts(current => current.map(item => item.id === selectedTextId
        ? { ...item, text: clean, style: draftStyle, size: draftSize, color: draftColor, effect: draftEffect }
        : item));
    } else {
      const id = `${Date.now()}-${Math.random()}`;
      setTexts(current => [...current, {
        id, text: clean, style: draftStyle, size: draftSize, color: draftColor, effect: draftEffect,
        x: FRAME_W / 2, y: FRAME_H * (0.38 + Math.min(current.length, 3) * 0.1),
      }]);
      setSelectedTextId(id);
    }
    setActiveTool(null);
  };

  const selectText = (event, item) => {
    event.stopPropagation();
    setSelectedStickerId(null);
    setSelectedTextId(item.id);
    setDraftText(item.text);
    setDraftStyle(item.style);
    setDraftSize(item.size);
    setDraftColor(item.color || '#FFFFFF');
    setDraftEffect(item.effect || 'shadow');
    textDragRef.current = {
      id: item.id, startX: event.clientX, startY: event.clientY, x: item.x, y: item.y,
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

  const updateSelectedSize = (size) => {
    const safe = limit(size, 22, 54);
    setDraftSize(safe);
    if (selectedTextId) setTexts(current => current.map(item => item.id === selectedTextId ? { ...item, size: safe } : item));
  };

  const removeSelectedText = () => {
    if (!selectedTextId) return;
    setTexts(current => current.filter(item => item.id !== selectedTextId));
    setSelectedTextId(null);
    setDraftText('');
    setActiveTool(null);
  };

  const addSticker = (emoji) => {
    const id = `${Date.now()}-${Math.random()}`;
    setStickers(current => [...current, {
      id, emoji, size: 72, x: FRAME_W / 2,
      y: FRAME_H * (0.44 + Math.min(current.length, 3) * 0.08),
    }]);
    setSelectedTextId(null);
    setSelectedStickerId(id);
    setActiveTool(null);
  };

  const selectSticker = (event, item) => {
    event.stopPropagation();
    setSelectedTextId(null);
    setSelectedStickerId(item.id);
    stickerDragRef.current = {
      id: item.id, startX: event.clientX, startY: event.clientY, x: item.x, y: item.y,
    };
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* Safari */ }
  };

  const moveSticker = (event) => {
    const drag = stickerDragRef.current;
    if (!drag) return;
    event.stopPropagation();
    const x = limit(drag.x + (event.clientX - drag.startX), 28, FRAME_W - 28);
    const y = limit(drag.y + (event.clientY - drag.startY), 28, FRAME_H - 28);
    setStickers(current => current.map(item => item.id === drag.id ? { ...item, x, y } : item));
  };

  const stopSticker = (event) => {
    event?.stopPropagation?.();
    stickerDragRef.current = null;
  };

  const resizeSelectedSticker = (delta) => {
    if (!selectedStickerId) return;
    setStickers(current => current.map(item => item.id === selectedStickerId
      ? { ...item, size: limit(item.size + delta, 42, 140) }
      : item));
  };

  const removeSelectedSticker = () => {
    if (!selectedStickerId) return;
    setStickers(current => current.filter(item => item.id !== selectedStickerId));
    setSelectedStickerId(null);
  };

  const toggleDraw = () => {
    setSelectedTextId(null);
    setSelectedStickerId(null);
    setActiveTool(current => current === 'draw' ? null : 'draw');
  };

  const undoStroke = () => setStrokes(current => current.slice(0, -1));
  const clearStrokes = () => setStrokes([]);

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

    const scaleX = OUTPUT_W / FRAME_W;
    const scaleY = OUTPUT_H / FRAME_H;

    strokes.forEach((stroke) => {
      if (!stroke.points.length) return;
      ctx.save();
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.size * scaleX;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (stroke.points.length === 1) {
        const point = stroke.points[0];
        ctx.beginPath();
        ctx.arc(point.x * scaleX, point.y * scaleY, (stroke.size * scaleX) / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        stroke.points.forEach((point, index) => {
          const x = point.x * scaleX;
          const y = point.y * scaleY;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
      ctx.restore();
    });

    texts.forEach((item) => {
      const fontSize = Math.round(item.size * scaleX);
      const lineHeight = Math.round(fontSize * 1.1);
      ctx.font = `800 ${fontSize}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = wrapLines(ctx, item.text, OUTPUT_W * 0.82);
      const centerX = item.x * scaleX;
      const centerY = item.y * scaleY;
      const startY = centerY - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((line, index) => {
        const y = startY + index * lineHeight;
        const width = Math.min(OUTPUT_W * 0.86, ctx.measureText(line || ' ').width + fontSize * 0.62);
        if (item.style !== 'clean') {
          ctx.save();
          ctx.fillStyle = item.style === 'highlight' ? 'rgba(255,255,255,.94)' : 'rgba(10,8,20,.74)';
          roundedRect(ctx, centerX - width / 2, y - lineHeight * 0.48, width, lineHeight * 0.96, fontSize * 0.2);
          ctx.fill();
          ctx.restore();
        }
        ctx.save();
        ctx.fillStyle = item.color || '#FFFFFF';
        if (item.effect === 'shadow') {
          ctx.shadowColor = 'rgba(0,0,0,.76)';
          ctx.shadowBlur = Math.max(8, fontSize * 0.16);
          ctx.shadowOffsetY = Math.max(2, fontSize * 0.035);
        } else if (item.effect === 'outline') {
          ctx.strokeStyle = effectStroke(item.color || '#FFFFFF');
          ctx.lineWidth = Math.max(4, fontSize * 0.055);
          ctx.lineJoin = 'round';
          ctx.strokeText(line, centerX, y);
        }
        ctx.fillText(line, centerX, y);
        ctx.restore();
      });
    });

    stickers.forEach((item) => {
      const size = Math.round(item.size * scaleX);
      ctx.save();
      ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.emoji, item.x * scaleX, item.y * scaleY);
      ctx.restore();
    });

    output.toBlob((blob) => {
      setSaving(false);
      if (!blob) return;
      onSave(new File([blob], `lumina-momento-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  };

  const filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
  const previewBackground = draftStyle === 'highlight'
    ? 'rgba(255,255,255,.94)'
    : draftStyle === 'dark' ? 'rgba(10,8,20,.74)' : 'transparent';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 110, background: '#080711', color: '#fff', overflow: 'hidden' }}>
      <div style={{
        width: '100%', maxWidth: 430, height: '100dvh', margin: '0 auto',
        padding: 'calc(10px + env(safe-area-inset-top)) 14px calc(10px + env(safe-area-inset-bottom))',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10, flexShrink: 0 }}>
          <button className="p" onClick={onCancel} aria-label="Cancelar edição do momento"
            style={{ padding: 10, background: 'rgba(255,255,255,.1)', color: '#fff', borderColor: 'transparent' }}><X size={17} /></button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="d" style={{ fontSize: 24, color: '#fff' }}>Editar momento</div>
            <div style={{ fontSize: 11.5, opacity: .62, marginTop: 2 }}>Arrasta · aproxima · escreve · decora · desenha</div>
          </div>
          <button type="button" className="p p-brand" onClick={save} disabled={!natural || saving}
            aria-label="Confirmar edição do momento"
            style={{ padding: '10px 16px', flexShrink: 0, fontWeight: 800 }}>
            {saving ? '…' : 'OK'}
          </button>
        </div>

        <div data-testid="moment-editor-scroll" style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 10 }}>
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

            <svg aria-label="Desenho do momento" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 3, pointerEvents: 'none' }} viewBox={`0 0 ${FRAME_W} ${FRAME_H}`}>
              {strokes.map(stroke => (
                <polyline key={stroke.id} data-moment-drawing-stroke points={stroke.points.map(point => `${point.x},${point.y}`).join(' ')}
                  fill="none" stroke={stroke.color} strokeWidth={stroke.size} strokeLinecap="round" strokeLinejoin="round" />
              ))}
            </svg>

            {texts.map(item => (
              <TextOverlay key={item.id} item={item} selected={item.id === selectedTextId}
                onSelect={selectText} onMove={moveText} onStop={stopText} />
            ))}
            {stickers.map(item => (
              <StickerOverlay key={item.id} item={item} selected={item.id === selectedStickerId}
                onSelect={selectSticker} onMove={moveSticker} onStop={stopSticker} />
            ))}

            <div data-testid="moment-photo-zoom-readout" style={{ position: 'absolute', top: 11, left: 11, zIndex: 5, padding: '6px 9px', borderRadius: 999, background: 'rgba(0,0,0,.5)', fontSize: 10.5, fontWeight: 700 }}>
              {Math.round(zoom * 100)}%
            </div>

            <div aria-label="Ferramentas do momento" style={{ position: 'absolute', top: 52, right: 10, zIndex: 7, display: 'grid', gap: 9 }}>
              <button type="button" onClick={openTextTool} aria-label="Adicionar texto ao momento"
                style={{ width: 46, height: 46, borderRadius: 99, border: '1px solid rgba(255,255,255,.24)', background: 'rgba(12,10,26,.66)', backdropFilter: 'blur(12px)', color: '#fff', fontSize: 18, fontWeight: 900, boxShadow: '0 7px 22px rgba(0,0,0,.22)' }}>
                Aa
              </button>
              <button type="button" onClick={() => setActiveTool('emoji')} aria-label="Adicionar emoji ao momento"
                style={{ width: 46, height: 46, borderRadius: 99, border: '1px solid rgba(255,255,255,.24)', background: 'rgba(12,10,26,.66)', backdropFilter: 'blur(12px)', color: '#fff', fontSize: 21, boxShadow: '0 7px 22px rgba(0,0,0,.22)' }}>
                😊
              </button>
              <button type="button" onClick={toggleDraw} aria-label="Desenhar no momento" aria-pressed={activeTool === 'draw'}
                style={{ width: 46, height: 46, borderRadius: 99, border: '1px solid rgba(255,255,255,.24)', background: activeTool === 'draw' ? '#6C55FF' : 'rgba(12,10,26,.66)', backdropFilter: 'blur(12px)', color: '#fff', fontSize: 21, fontWeight: 800, boxShadow: '0 7px 22px rgba(0,0,0,.22)' }}>
                ✎
              </button>
            </div>

            {activeTool === 'draw' && (
              <div data-moment-draw-controls style={{
                position: 'absolute', left: 10, right: 10, bottom: 10, zIndex: 9,
                padding: 9, borderRadius: 20, background: 'rgba(10,8,22,.78)', backdropFilter: 'blur(14px)',
                border: '1px solid rgba(255,255,255,.18)', boxShadow: '0 8px 28px rgba(0,0,0,.28)',
              }}>
                <ColorStrip colors={DRAW_COLORS} value={drawColor} onChange={setDrawColor} prefix="Cor do desenho" />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                  {[3, 6, 10].map(size => (
                    <button key={size} type="button" onClick={() => setDrawSize(size)} aria-label={`Espessura do desenho ${size}`}
                      aria-pressed={drawSize === size}
                      style={{ flex: 1, height: 34, borderRadius: 999, border: 0, background: drawSize === size ? '#fff' : 'rgba(255,255,255,.1)', color: drawSize === size ? '#111018' : '#fff', fontWeight: 800 }}>
                      {size === 3 ? 'Fino' : size === 6 ? 'Médio' : 'Grosso'}
                    </button>
                  ))}
                  <button type="button" onClick={undoStroke} aria-label="Desfazer último traço" disabled={!strokes.length}
                    style={{ width: 38, height: 34, borderRadius: 999, border: 0, background: 'rgba(255,255,255,.1)', color: '#fff' }}>↶</button>
                  <button type="button" onClick={clearStrokes} aria-label="Limpar desenho" disabled={!strokes.length}
                    style={{ width: 38, height: 34, borderRadius: 999, border: 0, background: 'rgba(255,90,90,.15)', color: '#FF8C86' }}>⌫</button>
                  <button type="button" onClick={() => setActiveTool(null)} aria-label="Concluir desenho"
                    style={{ width: 42, height: 34, borderRadius: 999, border: 0, background: '#6C55FF', color: '#fff', fontWeight: 900 }}>✓</button>
                </div>
              </div>
            )}

            {activeTool !== 'draw' && (selectedTextId || selectedStickerId) && (
              <div style={{
                position: 'absolute', left: '50%', bottom: 12, transform: 'translateX(-50%)', zIndex: 8,
                display: 'flex', alignItems: 'center', gap: 6, padding: 6, borderRadius: 999,
                background: 'rgba(10,8,22,.72)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,.18)',
                boxShadow: '0 8px 24px rgba(0,0,0,.26)',
              }}>
                {selectedTextId ? (
                  <>
                    <button type="button" onClick={openTextTool} aria-label="Editar texto" style={{ border: 0, background: 'rgba(255,255,255,.12)', color: '#fff', borderRadius: 99, width: 38, height: 38, fontWeight: 900 }}>Aa</button>
                    <button type="button" onClick={() => updateSelectedSize(draftSize - 4)} aria-label="Diminuir texto" style={{ border: 0, background: 'transparent', color: '#fff', width: 38, height: 38 }}><Minus size={17} /></button>
                    <button type="button" onClick={() => updateSelectedSize(draftSize + 4)} aria-label="Aumentar texto" style={{ border: 0, background: 'transparent', color: '#fff', width: 38, height: 38 }}><Plus size={17} /></button>
                    <button type="button" onClick={removeSelectedText} aria-label="Apagar texto" style={{ border: 0, background: 'transparent', color: '#FF8077', width: 38, height: 38 }}><Trash2 size={17} /></button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => resizeSelectedSticker(-12)} aria-label="Diminuir sticker" style={{ border: 0, background: 'transparent', color: '#fff', width: 38, height: 38 }}><Minus size={17} /></button>
                    <button type="button" onClick={() => resizeSelectedSticker(12)} aria-label="Aumentar sticker" style={{ border: 0, background: 'transparent', color: '#fff', width: 38, height: 38 }}><Plus size={17} /></button>
                    <button type="button" onClick={removeSelectedSticker} aria-label="Apagar sticker" style={{ border: 0, background: 'transparent', color: '#FF8077', width: 38, height: 38 }}><Trash2 size={17} /></button>
                  </>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button type="button" className="p" onClick={rotate} style={{ flex: 1, justifyContent: 'center', background: 'rgba(255,255,255,.09)', color: '#fff', borderColor: 'transparent' }}>
              <RotateCw size={15} /> Rodar
            </button>
            <button type="button" className="p" onClick={reset} style={{ flex: 1, justifyContent: 'center', background: 'rgba(255,255,255,.09)', color: '#fff', borderColor: 'transparent' }}>
              <Undo2 size={15} /> Repor foto
            </button>
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
        </div>

        <div style={{ flexShrink: 0, paddingTop: 9, background: 'linear-gradient(180deg,rgba(8,7,17,0),#080711 28%)' }}>
          <button type="button" className="p p-brand" onClick={save} disabled={!natural || saving}
            style={{ width: '100%', padding: 15, fontSize: 15 }}>
            {saving ? 'A preparar…' : 'Usar no momento'}
          </button>
        </div>
      </div>

      {activeTool === 'text' && (
        <div role="dialog" aria-label="Editor de texto do momento" style={{
          position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(5,4,13,.78)', backdropFilter: 'blur(10px)',
          padding: 'calc(12px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom))',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" className="p" onClick={() => setActiveTool(null)} style={{ background: 'rgba(255,255,255,.1)', color: '#fff', borderColor: 'transparent' }}>Cancelar</button>
            <div style={{ flex: 1, textAlign: 'center', fontWeight: 800 }}>Texto</div>
            <button type="button" className="p p-brand" onClick={saveText} disabled={!draftText.trim()} aria-label="Concluir texto">Concluir</button>
          </div>

          <div style={{ flex: 1, display: 'grid', placeItems: 'center', minHeight: 0 }}>
            <textarea ref={textInputRef} aria-label="Texto do momento" placeholder="Escreve algo…" value={draftText}
              onChange={event => setDraftText(event.target.value)} maxLength={180} rows={3}
              style={{
                width: '100%', maxWidth: 380, minHeight: 130, resize: 'none', border: 0, outline: 0,
                background: previewBackground, color: draftColor,
                fontSize: draftSize, fontWeight: 800, lineHeight: 1.08, textAlign: 'center',
                textShadow: draftEffect === 'shadow' ? '0 3px 12px rgba(0,0,0,.76)' : 'none',
                WebkitTextStroke: draftEffect === 'outline' ? `1px ${effectStroke(draftColor)}` : '0 transparent',
                paintOrder: 'stroke fill', padding: 16, borderRadius: 18,
              }} />
          </div>

          <div style={{ padding: 12, borderRadius: 22, background: 'rgba(255,255,255,.08)', display: 'grid', gap: 11 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 750, opacity: .7, marginBottom: 7 }}>Cor</div>
              <ColorStrip colors={TEXT_COLORS} value={draftColor} onChange={setDraftColor} prefix="Cor do texto" />
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 750, opacity: .7, marginBottom: 7 }}>Fundo</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                {[['clean', 'Livre'], ['highlight', 'Claro'], ['dark', 'Escuro']].map(([value, label]) => (
                  <button key={value} type="button" className="p p-sm" onClick={() => setDraftStyle(value)} aria-pressed={draftStyle === value}
                    style={{ flex: 1, justifyContent: 'center', background: draftStyle === value ? '#fff' : 'rgba(255,255,255,.08)', color: draftStyle === value ? '#171425' : '#fff', borderColor: 'transparent' }}>{label}</button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 750, opacity: .7, marginBottom: 7 }}>Efeito</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['shadow', 'Sombra'], ['outline', 'Contorno'], ['none', 'Sem efeito']].map(([value, label]) => (
                  <button key={value} type="button" className="p p-sm" onClick={() => setDraftEffect(value)} aria-pressed={draftEffect === value}
                    style={{ flex: 1, justifyContent: 'center', background: draftEffect === value ? '#6C55FF' : 'rgba(255,255,255,.08)', color: '#fff', borderColor: 'transparent' }}>{label}</button>
                ))}
              </div>
            </div>

            <label style={{ display: 'grid', gridTemplateColumns: '68px 1fr 34px', alignItems: 'center', gap: 8, fontSize: 12 }}>
              Tamanho
              <input aria-label="Tamanho do texto" type="range" min="22" max="54" value={draftSize} onChange={event => setDraftSize(Number(event.target.value))} />
              <span>{draftSize}</span>
            </label>
            <div style={{ textAlign: 'center', fontSize: 10.5, opacity: .6 }}>Podes usar emojis no texto e depois arrastar tudo diretamente sobre a fotografia.</div>
          </div>
        </div>
      )}

      {activeTool === 'emoji' && (
        <div role="dialog" aria-label="Escolher emoji para o momento" onClick={() => setActiveTool(null)} style={{
          position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(5,4,13,.58)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'flex-end',
        }}>
          <div onClick={event => event.stopPropagation()} style={{
            width: '100%', maxWidth: 430, margin: '0 auto', padding: '16px 16px calc(18px + env(safe-area-inset-bottom))',
            borderRadius: '28px 28px 0 0', background: '#171426', boxShadow: '0 -18px 50px rgba(0,0,0,.35)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 850 }}>Emojis e stickers</div>
                <div style={{ fontSize: 11, opacity: .58, marginTop: 3 }}>Toca num · depois arrasta e muda o tamanho na foto</div>
              </div>
              <button type="button" className="p" onClick={() => setActiveTool(null)} aria-label="Fechar emojis" style={{ background: 'rgba(255,255,255,.09)', color: '#fff', borderColor: 'transparent' }}><X size={16} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, maxHeight: '44dvh', overflowY: 'auto' }}>
              {EMOJIS.map((emoji, index) => (
                <button key={`${emoji}-${index}`} type="button" onClick={() => addSticker(emoji)} aria-label={`Adicionar emoji ${emoji}`}
                  style={{ aspectRatio: '1', border: 0, borderRadius: 16, background: 'rgba(255,255,255,.08)', fontSize: 28 }}>
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
