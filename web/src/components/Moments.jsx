import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pencil, RefreshCw, Send, Trash2, Video, X } from 'lucide-react';
import { Orb } from '../ui.jsx';
import { MomentImageEditor } from './moments/MomentImageEditor.jsx';
import '../publishing-polish.css';

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
export function MomentViewer({ group, onClose, onNext, onPrev, onView, onEdit = group.onEdit, onDelete, onReply, meId }) {
  const [i, setI] = useState(0);
  const [reply, setReply] = useState('');
  const [sent, setSent] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [replacing, setReplacing] = useState(false);
  const replacementInput = useRef(null);
  const safeI = Math.min(i, group.items.length - 1);
  const item = group.items[safeI];
  const isMine = group.author.id === meId;
  const isVideo = !!item && (
    item.media_mime?.startsWith('video/') || /\.(mp4|mov|webm)(?:$|\?)/i.test(item.media_url || '')
  );

  useEffect(() => { setI(0); setReply(''); setSent(false); }, [group.author.id]);
  useEffect(() => { setVideoProgress(0); }, [item?.id]);
  useEffect(() => { if (item && !isMine) onView(item.id); }, [item?.id]);

  useEffect(() => {
    if (!item || reply || isVideo || replacing) return;
    const t = setTimeout(() => {
      if (safeI < group.items.length - 1) setI(safeI + 1);
      else onNext();
    }, 5000);
    return () => clearTimeout(t);
  }, [safeI, group.author.id, group.items.length, reply, isVideo, replacing]);

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

  const replaceMedia = async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file || !onEdit) return;
    setReplacing(true);
    try {
      await onEdit(item.id, file);
    } finally {
      setReplacing(false);
    }
  };

  return (
    <div className="reveal" style={{ position: 'fixed', inset: 0, zIndex: 80, background: '#0B0A17' }}>
      <div style={{ display: 'flex', gap: 4, padding: '12px 12px 0', position: 'relative', zIndex: 4 }}>
        {group.items.map((it, idx) => {
          const activeVideo = idx === safeI && isVideo;
          return (
            <div key={it.id} style={{ flex: 1, height: 3, borderRadius: 9, background: 'rgba(255,255,255,.28)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', background: '#fff',
                width: idx < safeI ? '100%' : idx > safeI ? '0%' : activeVideo ? `${videoProgress}%` : '100%',
                transition: idx === safeI && !activeVideo ? 'width 5s linear' : 'none',
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ position: 'relative', zIndex: 4, display: 'flex', alignItems: 'center', gap: 6, padding: '12px 16px' }}>
        <Orb p={group.author.palette} avatarUrl={group.author.avatarUrl} s={30} />
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{isMine ? 'Tu' : group.author.name}</span>
        <span style={{ color: 'rgba(255,255,255,.6)', fontFamily: 'DM Mono, monospace', fontSize: 11 }}>
          {new Date(item.created_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
        </span>
        {isMine && (
          <input
            ref={replacementInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
            hidden
            onChange={replaceMedia}
          />
        )}
        {isMine && (
          <button onClick={() => replacementInput.current?.click()} disabled={replacing} aria-label="Editar momento"
            style={{ marginLeft: 'auto', background: 'none', border: 0, color: 'rgba(255,255,255,.8)', padding: 8 }}>
            {replacing ? <RefreshCw size={17} /> : <Pencil size={17} />}
          </button>
        )}
        {isMine && (
          <button onClick={() => onDelete(item.id)} aria-label="Apagar momento"
            style={{ background: 'none', border: 0, color: 'rgba(255,255,255,.8)', padding: 8 }}>
            <Trash2 size={17} />
          </button>
        )}
        <button onClick={onClose} aria-label="Fechar" style={{ marginLeft: isMine ? 0 : 'auto', background: 'none', border: 0, color: '#fff', padding: 8 }}>
          <X size={20} />
        </button>
      </div>

      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        {item.media_url ? (
          isVideo ? (
            <video
              src={item.media_url}
              autoPlay
              controls
              playsInline
              preload="metadata"
              aria-label={`Vídeo do momento de ${group.author.name}`}
              onTimeUpdate={(event) => {
                const media = event.currentTarget;
                if (Number.isFinite(media.duration) && media.duration > 0) {
                  setVideoProgress(Math.min(100, (media.currentTime / media.duration) * 100));
                }
              }}
              onEnded={() => advance(1)}
              style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#05040A' }}
            />
          ) : (
            <img src={item.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          )
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(160deg,#171329,#090811)' }} />
        )}
      </div>

      {!isVideo ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', zIndex: 2 }}>
          <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => advance(-1)} />
          <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => advance(1)} />
        </div>
      ) : (
        <>
          <button onClick={() => advance(-1)} aria-label="Momento anterior" style={{ position: 'absolute', zIndex: 3, left: 0, top: 86, bottom: 94, width: '15%', border: 0, background: 'transparent' }} />
          <button onClick={() => advance(1)} aria-label="Momento seguinte" style={{ position: 'absolute', zIndex: 3, right: 0, top: 86, bottom: 94, width: '15%', border: 0, background: 'transparent' }} />
        </>
      )}

      {!isMine && (
        <form onSubmit={submitReply} style={{
          position: 'absolute', zIndex: 4, left: 0, right: 0, bottom: 0,
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

/** Folha para publicar um Momento vertical: fotografia editável ou vídeo. */
export function MomentComposer({ onClose, onPublish, file, setFile, busy }) {
  const imageInput = useRef(null);
  const videoInput = useRef(null);
  const [editingPhoto, setEditingPhoto] = useState(false);
  const preview = useMemo(() => file ? URL.createObjectURL(file) : null, [file]);
  const isVideo = !!file?.type?.startsWith('video/');

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => { if (!file || isVideo) setEditingPhoto(false); }, [file, isVideo]);

  const pickMedia = (picked) => {
    if (!picked) return;
    setFile(picked);
    setEditingPhoto(picked.type.startsWith('image/'));
  };

  const removeMedia = () => {
    setEditingPhoto(false);
    setFile(null);
    if (imageInput.current) imageInput.current.value = '';
    if (videoInput.current) videoInput.current.value = '';
  };

  return (
    <>
      <div className="moment-composer-backdrop" onClick={() => !busy && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(24,18,60,.38)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'flex-end', zIndex: 60 }}>
        <div onClick={e => e.stopPropagation()} className="in moment-composer-sheet" style={{
          background: 'linear-gradient(180deg,#F7F5FF,#E9E7F8)', borderRadius: '30px 30px 0 0', width: '100%', maxWidth: 560,
          maxHeight: '94dvh', overflowY: 'auto', margin: '0 auto', padding: '22px 20px calc(26px + env(safe-area-inset-bottom))',
          boxShadow: '0 -18px 60px rgba(30,22,70,.16)',
        }}>
          <div className="moment-composer-head" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <div className="moment-composer-kicker">24 HORAS · VERTICAL</div>
              <h3 className="d" style={{ fontSize: 28, lineHeight: 1, margin: 0 }}>Criar momento</h3>
              <div className="m" style={{ marginTop: 6 }}>Partilha um instante em ecrã inteiro. Fica visível durante 24 horas.</div>
            </div>
            <button className="p moment-composer-close" onClick={onClose} aria-label="Fechar" style={{ padding: 10 }}><X size={16} /></button>
          </div>

          <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
            onChange={e => {
              const picked = e.target.files?.[0] || null;
              e.target.value = '';
              pickMedia(picked);
            }} />
          <input ref={videoInput} type="file" accept="video/mp4,video/quicktime,video/webm" style={{ display: 'none' }}
            onChange={e => {
              const picked = e.target.files?.[0] || null;
              e.target.value = '';
              pickMedia(picked);
            }} />

          {preview && file ? (
            <div style={{ marginBottom: 15 }}>
              <div className="moment-composer-preview" style={{
                position: 'relative', width: '100%', aspectRatio: '9 / 16', maxHeight: '61dvh', overflow: 'hidden',
                borderRadius: 25, background: '#080711', boxShadow: '0 16px 38px rgba(30,22,70,.18)',
              }}>
                {isVideo ? (
                  <video src={preview} controls playsInline preload="metadata" aria-label="Pré-visualização do vídeo do momento"
                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#080711' }} />
                ) : (
                  <img src={preview} alt="Pré-visualização do momento" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                )}
                <span style={{
                  position: 'absolute', top: 12, left: 12, padding: '7px 10px', borderRadius: 999,
                  background: 'rgba(10,8,25,.64)', backdropFilter: 'blur(8px)', color: '#fff',
                  fontSize: 11, fontWeight: 700, letterSpacing: '.03em', pointerEvents: 'none',
                }}>{isVideo ? 'VÍDEO · MOMENTO' : '9:16 · MOMENTO'}</span>
                {!isVideo && (
                  <button type="button" onClick={() => setEditingPhoto(true)} aria-label="Editar foto do momento"
                    style={{
                      position: 'absolute', right: 12, bottom: 12, display: 'flex', alignItems: 'center', gap: 7,
                      border: 0, borderRadius: 999, padding: '10px 14px', cursor: 'pointer', background: 'rgba(255,255,255,.94)',
                      color: 'var(--ink)', fontWeight: 700, boxShadow: '0 7px 20px rgba(0,0,0,.18)',
                    }}><Pencil size={14} /> Editar</button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 10 }}>
                <button type="button" className="p" onClick={() => (isVideo ? videoInput : imageInput).current?.click()} style={{ justifyContent: 'center' }}>
                  <RefreshCw size={14} /> Trocar
                </button>
                <button type="button" className="p" onClick={removeMedia} style={{ justifyContent: 'center', color: 'var(--coral)' }}>
                  <Trash2 size={14} /> Remover
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <div className="m" style={{ margin: '0 0 9px 2px' }}>Escolher formato</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
                <button className="moment-composer-picker" type="button" onClick={() => imageInput.current?.click()} aria-label="Adicionar fotografia ao momento"
                  style={{
                    minHeight: 128, padding: 15, border: '1.5px dashed #C8C2E4', borderRadius: 23, cursor: 'pointer',
                    background: 'rgba(255,255,255,.7)', color: 'var(--ink)', display: 'grid', placeItems: 'center', gap: 7,
                  }}>
                  <span className="moment-composer-picker-icon" style={{ width: 42, height: 42, borderRadius: 99, display: 'grid', placeItems: 'center', background: '#fff', boxShadow: '0 6px 18px rgba(30,22,70,.09)' }}><Image size={19} /></span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>Fotografia</span>
                  <span className="m" style={{ fontSize: 9.5 }}>9:16 · recorta e personaliza</span>
                </button>
                <button className="moment-composer-picker" type="button" onClick={() => videoInput.current?.click()} aria-label="Adicionar vídeo ao momento"
                  style={{
                    minHeight: 128, padding: 15, border: '1.5px dashed #C8C2E4', borderRadius: 23, cursor: 'pointer',
                    background: 'rgba(255,255,255,.7)', color: 'var(--ink)', display: 'grid', placeItems: 'center', gap: 7,
                  }}>
                  <span className="moment-composer-picker-icon" style={{ width: 42, height: 42, borderRadius: 99, display: 'grid', placeItems: 'center', background: '#fff', boxShadow: '0 6px 18px rgba(30,22,70,.09)' }}><Video size={19} /></span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>Vídeo</span>
                  <span className="m" style={{ fontSize: 9.5 }}>MP4, MOV ou WebM</span>
                </button>
              </div>
              <div className="m" style={{ margin: '9px 2px 0', fontSize: 9.5 }}>Fotos até 8 MB · vídeos até 100 MB</div>
            </div>
          )}

          <button className="p p-brand moment-composer-publish" onClick={onPublish} disabled={busy || !file} style={{ width: '100%', padding: 15, fontSize: 15 }}>
            {busy ? 'A publicar…' : 'Partilhar momento'}
          </button>
        </div>
      </div>

      {editingPhoto && file && !isVideo && (
        <MomentImageEditor
          file={file}
          onCancel={() => setEditingPhoto(false)}
          onSave={(editedFile) => {
            setFile(editedFile);
            setEditingPhoto(false);
          }}
        />
      )}
    </>
  );
}