import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera } from 'lucide-react';
import { api } from '../api.js';
import { PAL, Orb } from '../ui.jsx';

/** Recorte circular interativo do avatar. */
function PhotoCropper({ file, onConfirm, onCancel }) {
  const FRAME = 260;
  const OUTPUT = 480;
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState(null);
  const imgUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const imgRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => () => URL.revokeObjectURL(imgUrl), [imgUrl]);

  const baseScale = natural ? Math.max(FRAME / natural.w, FRAME / natural.h) : 1;
  const scale = baseScale * zoom;
  const dispW = natural ? natural.w * scale : FRAME;
  const dispH = natural ? natural.h * scale : FRAME;
  const maxX = Math.max(0, (dispW - FRAME) / 2);
  const maxY = Math.max(0, (dispH - FRAME) / 2);
  const clamp = (v, m) => Math.min(m, Math.max(-m, v));

  useEffect(() => {
    setOffset(o => ({ x: clamp(o.x, maxX), y: clamp(o.y, maxY) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, natural]);

  const onPointerDown = (e) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, offX: offset.x, offY: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset({ x: clamp(dragRef.current.offX + dx, maxX), y: clamp(dragRef.current.offY + dy, maxY) });
  };
  const onPointerUp = () => { dragRef.current = null; };

  const confirm = () => {
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT; canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    const sx = ((dispW - FRAME) / 2 - offset.x) / scale;
    const sy = ((dispH - FRAME) / 2 - offset.y) / scale;
    const sSize = FRAME / scale;
    ctx.drawImage(imgRef.current, sx, sy, sSize, sSize, 0, 0, OUTPUT, OUTPUT);
    canvas.toBlob((blob) => {
      if (!blob) return onCancel();
      onConfirm(new File([blob], 'avatar.png', { type: 'image/png' }));
    }, 'image/png', 0.92);
  };

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(10,8,26,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 90, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} className="card in" style={{ padding: 20, maxWidth: 340, width: '100%' }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14, textAlign: 'center' }}>Ajusta a foto</div>
        <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
          style={{ width: FRAME, height: FRAME, borderRadius: '50%', overflow: 'hidden', margin: '0 auto 16px', position: 'relative', touchAction: 'none', cursor: 'grab', background: '#EEE' }}>
          <img
            ref={el => {
              imgRef.current = el;
              if (el?.complete && el.naturalWidth > 0) setNatural(n => n || { w: el.naturalWidth, h: el.naturalHeight });
            }}
            src={imgUrl} onLoad={e => setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })} alt="" draggable={false}
            style={{ position: 'absolute', left: '50%', top: '50%', width: dispW, height: dispH, maxWidth: 'none',
              transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`, userSelect: 'none', pointerEvents: 'none' }} />
        </div>
        <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={e => setZoom(Number(e.target.value))}
          style={{ width: '100%', marginBottom: 18, accentColor: 'var(--cobalt)' }} />
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="p" style={{ flex: 1 }} onClick={onCancel}>Cancelar</button>
          <button className="p p-brand" style={{ flex: 1 }} onClick={confirm} disabled={!natural}>Usar foto</button>
        </div>
      </div>
    </div>
  );
}

/** Editar nome, biografia, cor, foto e password. */
export function EditarPerfil({ me, onSave, onBack, ping }) {
  const [name, setName] = useState(me.name);
  const [bio, setBio] = useState(me.bio || '');
  const [palette, setPalette] = useState(me.palette);
  const [avatarUrl, setAvatarUrl] = useState(me.avatar_url || '');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [cropFile, setCropFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  const [current, setCurrent] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  const pickFile = (file) => {
    setAvatarPreview(prev => { if (prev) URL.revokeObjectURL(prev); return file ? URL.createObjectURL(file) : null; });
    setAvatarFile(file);
  };

  const save = async () => {
    if (String(name).trim().length < 2) return ping('O nome precisa de pelo menos 2 letras');
    setBusy(true);
    try {
      let nextAvatarUrl = avatarUrl;
      if (avatarFile) nextAvatarUrl = await api.upload(avatarFile);
      const user = await api.auth.update({ name: name.trim(), bio, palette, avatarUrl: nextAvatarUrl || null });
      onSave(user);
      ping('Perfil atualizado');
      onBack();
    } catch (e) { ping(e.message); }
    finally { setBusy(false); }
  };

  const changePassword = async () => {
    if (!current || !newPassword) return ping('Preenche as duas passwords');
    setPwBusy(true);
    try {
      await api.auth.changePassword({ current, password: newPassword });
      setCurrent(''); setNewPassword('');
      ping('Password alterada');
    } catch (e) { ping(e.message); }
    finally { setPwBusy(false); }
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
            <Orb p={palette} avatarUrl={shownAvatar} s={72} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) setCropFile(f); e.target.value = ''; }} />
              <button className="p p-sm" onClick={() => fileInput.current?.click()}>
                <Camera size={13} style={{ verticalAlign: -2, marginRight: 6 }} />{shownAvatar ? 'Trocar foto' : 'Escolher foto'}
              </button>
              {shownAvatar && (
                <button className="p p-sm" style={{ color: 'var(--coral)' }}
                  onClick={() => { pickFile(null); setAvatarUrl(''); }}>Remover foto</button>
              )}
            </div>
          </div>

          {!shownAvatar && (
            <div className="scene" style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              {PAL.map((t, i) => (
                <button key={i} onClick={() => setPalette(i)} className="st"
                  style={{ width: 44, height: 56, background: t.bg, border: 0, cursor: 'pointer', padding: 0, transform: palette === i ? 'translateY(-6px) scale(1.06)' : 'none' }}>
                  <div className="gloss" />
                </button>
              ))}
            </div>
          )}

          <label className="m" style={{ display: 'block', marginBottom: 6 }}>Nome</label>
          <input value={name} onChange={e => setName(e.target.value)} style={{ marginBottom: 14 }} />
          <label className="m" style={{ display: 'block', marginBottom: 6 }}>Biografia</label>
          <textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={300} rows={3}
            style={{ width: '100%', resize: 'none', marginBottom: 4 }} />
          <div className="m" style={{ textAlign: 'right', marginBottom: 14 }}>{bio.length}/300</div>

          <button className="p p-brand" disabled={busy} style={{ width: '100%', padding: 14 }} onClick={save}>
            {busy ? 'A guardar…' : 'Guardar alterações'}
          </button>
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div className="m" style={{ marginBottom: 10 }}>Mudar password</div>
          <input type="password" placeholder="Password atual" value={current} onChange={e => setCurrent(e.target.value)}
            autoComplete="current-password" style={{ marginBottom: 10 }} />
          <input type="password" placeholder="Password nova" value={newPassword} onChange={e => setNewPassword(e.target.value)}
            autoComplete="new-password" minLength={8} style={{ marginBottom: 12 }} />
          <button className="p" disabled={pwBusy} onClick={changePassword}>
            {pwBusy ? 'A mudar…' : 'Mudar password'}
          </button>
        </div>
      </div>

      {cropFile && (
        <PhotoCropper file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={(cropped) => { pickFile(cropped); setCropFile(null); }} />
      )}
    </div>
  );
}
