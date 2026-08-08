import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Send, Trash2, X } from 'lucide-react';
import { PAL, Orb } from '../ui.jsx';

/** O anel à volta do avatar: gradiente para quem tem algo por ver, cinza para quem já viste tudo. */
export function MomentRing({ palette, avatarUrl, allSeen, size = 52, children }) {
  return (
    <div style={{ padding: 3, borderRadius: '50%', background: allSeen ? '#D6D1EE' : 'linear-gradient(135deg,var(--coral),var(--cobalt))' }}>
      <div style={{ padding: 3, borderRadius: '50%', background: 'var(--paper)' }}>
        {children || <Orb p={palette} avatarUrl={avatarUrl} s={size} />}
      </div>
    </div>
  );
}

/** Visualizador em ecrã inteiro dos Momentos. */
export function MomentViewer({ group, onClose, onNext, onPrev, onView, onDelete, onReply, meId }) {
  const [i, setI] = useState(0);
  const [reply, setReply] = useState('');
  const [sent, setSent] = useState(false);
  const safeI = Math.min(i, group.items.length - 1);
  const item = group.items[safeI];
  const isMine = group.author.id === meId;

  useEffect(() => { setI(0); setReply(''); setSent(false); }, [group.author.id]);
  useEffect(() => { if (item && !isMine) onView(item.id); }, [item?.id]);

  useEffect(() => {
    if (!item || reply) return;
    const t = setTimeout(() => {
      if (safeI < group.items.length - 1) setI(safeI + 1);
      else onNext();
    }, 5000);
    return () => clearTimeout(t);
  }, [safeI, group.author.id, group.items.length, reply]);

  if (!item) return null;

  const advance = (dir) => {
    if (dir > 0 && safeI < group.items.length - 1) return setI(safeI + 1);
    if (dir < 0 && safeI > 0) return setI(safeI - 1);
    if (dir > 0) return onNext();
    onPrev();
  };

  const submitReply = (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    onReply(group.author.id, reply.trim());
    setReply(''); setSent(true);
    setTimeout(() => setSent(false), 2200);
  };

  return (
    <div className="reveal" style={{ position: 'fixed', inset: 0, zIndex: 80, background: '#0B0A17' }}>
      <div style={{ display: 'flex', gap: 4, padding: '12px 12px 0' }}>
        {group.items.map((it, idx) => (
          <div key={it.id} style={{ flex: 1, height: 3, borderRadius: 9, background: 'rgba(255,255,255,.28)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: '#fff',
              width: idx < safeI ? '100%' : idx > safeI ? '0%' : '100%',
              transition: idx === safeI ? 'width 5s linear' : 'none',
            }} />
          </div>
        ))}
      </div>
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
        <Orb p={group.author.palette} avatarUrl={group.author.avatarUrl} s={30} />
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{isMine ? 'Tu' : group.author.name}</span>
        <span style={{ color: 'rgba(255,255,255,.6)', fontFamily: 'DM Mono, monospace', fontSize: 11 }}>
          {new Date(item.created_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
        </span>
        {isMine && (
          <button onClick={() => onDelete(item.id)} aria-label="Apagar momento"
            style={{ marginLeft: 'auto', background: 'none', border: 0, color: 'rgba(255,255,255,.8)', padding: 8 }}>
            <Trash2 size={17} />
          </button>
        )}
        <button onClick={onClose} aria-label="Fechar" style={{ marginLeft: isMine ? 6 : 'auto', background: 'none', border: 0, color: '#fff', padding: 8 }}>
          <X size={20} />
        </button>
      </div>

      <div style={{ position: 'absolute', inset: 0 }}>
        {item.media_url
          ? <img src={item.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <div style={{ width: '100%', height: '100%', background: PAL[item.palette % 5].bg }} />}
      </div>

      <div style={{ position: 'absolute', inset: 0, display: 'flex', zIndex: 1 }}>
        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => advance(-1)} />
        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => advance(1)} />
      </div>

      {!isMine && (
        <form onSubmit={submitReply} style={{
          position: 'absolute', zIndex: 2, left: 0, right: 0, bottom: 0,
          padding: '14px 14px calc(14px + env(safe-area-inset-bottom))',
          display: 'flex', gap: 9, background: 'linear-gradient(0deg,rgba(0,0,0,.5),transparent)',
        }}>
          <input value={reply} onChange={e => setReply(e.target.value)}
            placeholder={sent ? 'Enviado ✓' : `Responder a ${group.author.name.split(' ')[0]}…`}
            style={{ background: 'rgba(255,255,255,.14)', border: '1.5px solid rgba(255,255,255,.3)', color: '#fff' }}
            onFocus={e => e.target.placeholder = `Responder a ${group.author.name.split(' ')[0]}…`} />
          <button type="submit" aria-label="Enviar resposta" disabled={!reply.trim()}
            className="p p-brand" style={{ padding: '12px 15px' }}><Send size={16} /></button>
        </form>
      )}
    </div>
  );
}

/** Folha para publicar um momento novo: foto opcional, cor sempre. */
export function MomentComposer({ onClose, onPublish, palette, setPalette, file, setFile, busy }) {
  const fileInput = useRef(null);
  const preview = useMemo(() => file ? URL.createObjectURL(file) : null, [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  return (
    <div onClick={() => !busy && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(24,18,60,.36)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', zIndex: 60 }}>
      <div onClick={e => e.stopPropagation()} className="in" style={{ background: 'linear-gradient(180deg,#F3F1FC,#E9E7F8)', borderRadius: '30px 30px 0 0', width: '100%', maxWidth: 560, margin: '0 auto', padding: '22px 20px calc(26px + env(safe-area-inset-bottom))' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
          <h3 className="d" style={{ fontSize: 26, flex: 1, lineHeight: 1 }}>Momento</h3>
          <button className="p" onClick={onClose} aria-label="Fechar" style={{ padding: 10 }}><X size={16} /></button>
        </div>
        <p style={{ fontSize: 13.5, lineHeight: 1.45, color: 'var(--grey)', marginBottom: 16 }}>
          Fica visível 24 horas para quem partilha uma comunidade contigo. Não precisas de foto — só uma cor já chega.
        </p>

        {preview && (
          <div style={{ width: '100%', aspectRatio: '4/5', borderRadius: 20, overflow: 'hidden', marginBottom: 12, background: '#0B0A17' }}>
            <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        )}

        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
          onChange={e => { setFile(e.target.files?.[0] || null); e.target.value = ''; }} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button className="p" onClick={() => fileInput.current?.click()}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Image size={15} />{file ? 'Trocar foto' : 'Escolher foto (opcional)'}
          </button>
          {file && (
            <button className="p" style={{ color: 'var(--coral)' }} onClick={() => setFile(null)} aria-label="Remover foto">
              <X size={15} />
            </button>
          )}
        </div>

        {!file && (
          <div className="scene" style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
            {PAL.map((t, i) => (
              <button key={i} onClick={() => setPalette(i)} className="st"
                style={{ width: 48, height: 60, background: t.bg, border: 0, cursor: 'pointer', padding: 0, transform: palette === i ? 'translateY(-6px) scale(1.06)' : 'none' }}>
                <div className="gloss" />
              </button>
            ))}
          </div>
        )}

        <button className="p p-brand" onClick={onPublish} disabled={busy} style={{ width: '100%', padding: 15, fontSize: 15 }}>
          {busy ? 'A publicar…' : 'Publicar momento'}
        </button>
      </div>
    </div>
  );
}
