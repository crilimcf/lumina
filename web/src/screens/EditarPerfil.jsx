import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, Minus, Plus, X } from 'lucide-react';
import { api } from '../api.js';
import { Orb } from '../ui.jsx';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Recorte quadrado com máscara circular para o avatar. */
function PhotoCropper({ file, onConfirm, onCancel }) {
  const FRAME = 280;
  const OUTPUT = 640;
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState(null);
  const [saving, setSaving] = useState(false);
  const imgUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const imgRef = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const zoomRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => () => URL.revokeObjectURL(imgUrl), [imgUrl]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);

  const baseScale = natural ? Math.max(FRAME / natural.w, FRAME / natural.h) : 1;
  const scale = baseScale * zoom;
  const dispW = natural ? natural.w * scale : FRAME;
  const dispH = natural ? natural.h * scale : FRAME;

  const safeOffset = (candidate, nextZoom = zoomRef.current) => {
    const nextScale = baseScale * nextZoom;
    const maxX = natural ? Math.max(0, (natural.w * nextScale - FRAME) / 2) : 0;
    const maxY = natural ? Math.max(0, (natural.h * nextScale - FRAME) / 2) : 0;
    return {
      x: clamp(candidate.x, -maxX, maxX),
      y: clamp(candidate.y, -maxY, maxY),
    };
  };

  const applyOffset = (candidate, nextZoom = zoomRef.current) => {
    const safe = safeOffset(candidate, nextZoom);
    offsetRef.current = safe;
    setOffset(safe);
  };

  useEffect(() => {
    applyOffset(offsetRef.current, zoomRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natural]);

  const startGesture = () => {
    const points = [...pointersRef.current.values()].slice(0, 2);
    if (!points.length) return;
    if (points.length === 1) {
      gestureRef.current = {
        kind: 'pan',
        pointerId: points[0].id,
        startX: points[0].x,
        startY: points[0].y,
        startOffset: { ...offsetRef.current },
      };
      return;
    }
    gestureRef.current = {
      kind: 'pinch',
      startDistance: Math.max(1, distance(points[0], points[1])),
      startZoom: zoomRef.current,
      startOffset: { ...offsetRef.current },
      startMid: { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 },
    };
  };

  const onPointerDown = (event) => {
    event.preventDefault();
    pointersRef.current.set(event.pointerId, { id: event.pointerId, x: event.clientX, y: event.clientY });
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* Safari */ }
    startGesture();
  };

  const onPointerMove = (event) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    event.preventDefault();
    pointersRef.current.set(event.pointerId, { id: event.pointerId, x: event.clientX, y: event.clientY });
    const points = [...pointersRef.current.values()].slice(0, 2);
    const gesture = gestureRef.current;
    if (!gesture) return;

    if (points.length >= 2) {
      if (gesture.kind !== 'pinch') startGesture();
      const pinch = gestureRef.current;
      if (!pinch || pinch.kind !== 'pinch') return;
      const nextZoom = clamp(pinch.startZoom * (distance(points[0], points[1]) / pinch.startDistance), 1, 4);
      const mid = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
      zoomRef.current = nextZoom;
      setZoom(nextZoom);
      applyOffset({
        x: pinch.startOffset.x + (mid.x - pinch.startMid.x),
        y: pinch.startOffset.y + (mid.y - pinch.startMid.y),
      }, nextZoom);
      return;
    }

    if (gesture.kind === 'pan' && points.length === 1) {
      applyOffset({
        x: gesture.startOffset.x + (points[0].x - gesture.startX),
        y: gesture.startOffset.y + (points[0].y - gesture.startY),
      });
    }
  };

  const onPointerEnd = (event) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size) startGesture();
    else gestureRef.current = null;
  };

  const changeZoom = (next) => {
    const value = clamp(next, 1, 4);
    zoomRef.current = value;
    setZoom(value);
    applyOffset(offsetRef.current, value);
  };

  const confirm = () => {
    if (!natural || !imgRef.current || saving) return;
    setSaving(true);
    const finalScale = baseScale * zoomRef.current;
    const finalDispW = natural.w * finalScale;
    const finalDispH = natural.h * finalScale;
    const finalOffset = safeOffset(offsetRef.current, zoomRef.current);
    const sx = ((finalDispW - FRAME) / 2 - finalOffset.x) / finalScale;
    const sy = ((finalDispH - FRAME) / 2 - finalOffset.y) / finalScale;
    const sourceSize = FRAME / finalScale;

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#111018';
    ctx.fillRect(0, 0, OUTPUT, OUTPUT);
    ctx.drawImage(imgRef.current, sx, sy, sourceSize, sourceSize, 0, 0, OUTPUT, OUTPUT);
    canvas.toBlob((blob) => {
      setSaving(false);
      if (!blob) return;
      onConfirm(new File([blob], `lumina-avatar-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.93);
  };

  return (
    <div role="dialog" aria-label="Ajustar foto de perfil" onClick={onCancel} style={{
      position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(8,7,17,.78)', backdropFilter: 'blur(10px)',
      display: 'grid', placeItems: 'center', padding: 'calc(18px + env(safe-area-inset-top)) 18px calc(18px + env(safe-area-inset-bottom))',
    }}>
      <div onClick={event => event.stopPropagation()} style={{ width: '100%', maxWidth: 370, color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button className="p" onClick={onCancel} aria-label="Cancelar recorte" style={{ padding: 10, background: 'rgba(255,255,255,.1)', color: '#fff' }}><X size={17} /></button>
          <div style={{ flex: 1 }}>
            <div className="d" style={{ fontSize: 25, color: '#fff' }}>Ajustar foto</div>
            <div style={{ fontSize: 11.5, opacity: .62, marginTop: 3 }}>1 dedo move · 2 dedos aproximam</div>
          </div>
          <button className="p p-brand" onClick={confirm} disabled={!natural || saving} aria-label="Usar foto de perfil">{saving ? '…' : 'OK'}</button>
        </div>

        <div data-testid="avatar-crop-frame" onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} style={{
            width: FRAME, height: FRAME, maxWidth: '100%', margin: '0 auto', position: 'relative', overflow: 'hidden',
            borderRadius: '50%', touchAction: 'none', background: '#100C22', boxShadow: '0 24px 55px rgba(0,0,0,.42)',
          }}>
          <img ref={(node) => {
              imgRef.current = node;
              if (node?.complete && node.naturalWidth) setNatural(current => current || { w: node.naturalWidth, h: node.naturalHeight });
            }}
            src={imgUrl} alt="Foto a recortar" draggable={false}
            onLoad={event => setNatural({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })}
            style={{
              position: 'absolute', left: '50%', top: '50%', width: dispW, height: dispH, maxWidth: 'none',
              transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              pointerEvents: 'none', userSelect: 'none',
            }} />
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.38)', pointerEvents: 'none' }} />
        </div>

        <div style={{ marginTop: 14, padding: 10, borderRadius: 20, background: 'rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" aria-label="Diminuir zoom da foto" onClick={() => changeZoom(zoomRef.current - .12)}
            style={{ width: 42, height: 42, border: 0, borderRadius: 99, background: 'rgba(255,255,255,.1)', color: '#fff' }}><Minus size={17} /></button>
          <input aria-label="Zoom da foto de perfil" type="range" min="1" max="4" step="0.01" value={zoom}
            onChange={event => changeZoom(Number(event.target.value))} style={{ flex: 1, accentColor: '#7160FF' }} />
          <button type="button" aria-label="Aumentar zoom da foto" onClick={() => changeZoom(zoomRef.current + .12)}
            style={{ width: 42, height: 42, border: 0, borderRadius: 99, background: 'rgba(255,255,255,.1)', color: '#fff' }}><Plus size={17} /></button>
        </div>
      </div>
    </div>
  );
}

/** Editar nome, biografia, foto e password. */
export function EditarPerfil({ me, onSave, onBack, ping }) {
  const [name, setName] = useState(me.name);
  const [bio, setBio] = useState(me.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(me.avatar_url || '');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [cropFile, setCropFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  const [current, setCurrent] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); }, [avatarPreview]);

  const pickFile = (file) => {
    setAvatarPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return file ? URL.createObjectURL(file) : null;
    });
    setAvatarFile(file);
  };

  const removePhoto = () => {
    pickFile(null);
    setAvatarUrl('');
  };

  const save = async () => {
    if (String(name).trim().length < 2) return ping('O nome precisa de pelo menos 2 letras');
    setBusy(true);
    try {
      let nextAvatarUrl = avatarUrl || null;
      if (avatarFile) nextAvatarUrl = await api.upload(avatarFile);
      const user = await api.auth.update({
        name: name.trim(),
        bio,
        avatarUrl: nextAvatarUrl,
      });
      setAvatarUrl(user.avatar_url || '');
      setAvatarFile(null);
      setAvatarPreview(null);
      onSave(user);
      ping('Perfil atualizado');
      onBack();
    } catch (error) {
      ping(error.message || 'Não foi possível guardar o perfil');
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    if (!current || !newPassword) return ping('Preenche as duas passwords');
    setPwBusy(true);
    try {
      await api.auth.changePassword({ current, password: newPassword });
      setCurrent('');
      setNewPassword('');
      ping('Password alterada');
    } catch (error) {
      ping(error.message);
    } finally {
      setPwBusy(false);
    }
  };

  const shownAvatar = avatarPreview || avatarUrl || null;

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--paper)' }}>
      <div style={{ maxWidth: 460, margin: '0 auto', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <button className="p" onClick={onBack} aria-label="Voltar" style={{ padding: 10 }}><ArrowLeft size={16} /></button>
          <h2 className="d" style={{ fontSize: 24, flex: 1 }}>Editar perfil</h2>
        </div>

        <div className="card" style={{ padding: 18, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 21 }}>
            {shownAvatar ? (
              <img src={shownAvatar} alt="Pré-visualização da foto de perfil" style={{
                width: 86, height: 86, borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
                display: 'block', background: '#E8E4F5', boxShadow: '0 9px 24px rgba(30,18,80,.13)',
              }} />
            ) : (
              <Orb p={me.palette} s={86} />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                onChange={event => {
                  const picked = event.target.files?.[0];
                  event.target.value = '';
                  if (picked) setCropFile(picked);
                }} />
              <button className="p p-sm" onClick={() => fileInput.current?.click()} aria-label="Escolher foto de perfil">
                <Camera size={13} style={{ verticalAlign: -2, marginRight: 6 }} />{shownAvatar ? 'Trocar foto' : 'Escolher foto'}
              </button>
              {shownAvatar && (
                <button className="p p-sm" style={{ color: 'var(--coral)' }} onClick={removePhoto}>Remover foto</button>
              )}
            </div>
          </div>

          <label className="m" style={{ display: 'block', marginBottom: 6 }}>Nome</label>
          <input value={name} onChange={event => setName(event.target.value)} style={{ marginBottom: 14 }} />
          <label className="m" style={{ display: 'block', marginBottom: 6 }}>Biografia</label>
          <textarea value={bio} onChange={event => setBio(event.target.value)} maxLength={300} rows={3}
            style={{ width: '100%', resize: 'none', marginBottom: 4 }} />
          <div className="m" style={{ textAlign: 'right', marginBottom: 14 }}>{bio.length}/300</div>

          <button className="p p-brand" disabled={busy} style={{ width: '100%', padding: 14 }} onClick={save}>
            {busy ? 'A guardar…' : 'Guardar alterações'}
          </button>
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div className="m" style={{ marginBottom: 10 }}>Mudar password</div>
          <input type="password" placeholder="Password atual" value={current} onChange={event => setCurrent(event.target.value)}
            autoComplete="current-password" style={{ marginBottom: 10 }} />
          <input type="password" placeholder="Password nova" value={newPassword} onChange={event => setNewPassword(event.target.value)}
            autoComplete="new-password" minLength={8} style={{ marginBottom: 12 }} />
          <button className="p" disabled={pwBusy} onClick={changePassword}>
            {pwBusy ? 'A mudar…' : 'Mudar password'}
          </button>
        </div>
      </div>

      {cropFile && (
        <PhotoCropper file={cropFile} onCancel={() => setCropFile(null)} onConfirm={(cropped) => {
          pickFile(cropped);
          setCropFile(null);
        }} />
      )}
    </div>
  );
}
