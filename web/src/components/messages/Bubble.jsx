import React, { useEffect, useState } from 'react';
import { Eye, Loader2, Timer } from 'lucide-react';
import { PAL } from '../../ui.jsx';

/** Bolha de conversa, incluindo mensagens efémeras e de visualização única. */
export function Bubble({ msg, mine, onReveal }) {
  const [content, setContent] = useState(null);
  const [left, setLeft] = useState(null);
  const [dying, setDying] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (left === null || left > 0) {
      if (left > 0) {
        const t = setTimeout(() => setLeft(left - 1), 1000);
        return () => clearTimeout(t);
      }
      return;
    }
    setDying(true);
    const t = setTimeout(() => setContent(null), 600);
    return () => clearTimeout(t);
  }, [left]);

  const reveal = async () => {
    setBusy(true);
    try {
      const out = await onReveal(msg.id);
      setContent(out);
      setLeft(Math.max(1, Math.round((new Date(out.expiresAt) - Date.now()) / 1000)));
    } catch (e) {
      setContent({ error: e.message });
    } finally {
      setBusy(false);
    }
  };

  const side = { alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%' };
  const when = new Date(msg.created_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  const stamp = (t) => <div className="m" style={{ marginTop: 5, textAlign: mine ? 'right' : 'left' }}>{t || when}</div>;

  if (msg.purged_at || content?.error || dying) return (
    <div className="in" style={side}>
      <div className="ghost">{msg.mode === 'once' ? <Eye size={14} /> : <Timer size={14} />}
        {msg.mode === 'once' ? 'Foto já vista' : 'Mensagem apagada'}</div>
      {stamp()}
    </div>
  );

  if (msg.mode !== 'normal' && !content) {
    if (mine) return (
      <div className="in" style={side}>
        <div className="ghost" style={{ borderStyle: 'solid', borderColor: 'rgba(43,43,247,.28)', color: 'var(--cobalt)' }}>
          {msg.mode === 'once' ? <Eye size={14} /> : <Timer size={14} />}
          {msg.mode === 'once' ? 'Foto enviada · uma vez' : 'Efémera · à espera'}
        </div>{stamp()}
      </div>
    );
    return (
      <div className="in" style={side}>
        <div className="veil" onClick={busy ? undefined : reveal}
          style={{ width: msg.mode === 'once' ? 200 : 'auto', height: msg.mode === 'once' ? 250 : 'auto' }}>
          {msg.mode === 'once' && <div style={{ position: 'absolute', inset: 0, background: PAL[msg.palette || 1].bg }} />}
          <div className="veil-in" style={{ position: msg.mode === 'once' ? 'absolute' : 'static', inset: 0, padding: msg.mode === 'once' ? 0 : '14px 18px' }}>
            {busy ? <Loader2 size={20} className="float" /> : msg.mode === 'once' ? <Eye size={22} /> : <Timer size={20} />}
            <span style={{ fontSize: 13, fontWeight: 600 }}>{msg.mode === 'once' ? 'Ver uma vez' : 'Toca para ler'}</span>
            <span className="m" style={{ color: 'rgba(20,18,42,.6)' }}>{msg.mode === 'once' ? 'não volta' : 'apaga-se depois'}</span>
          </div>
        </div>{stamp()}
      </div>
    );
  }

  const body = content?.body ?? msg.body;
  const media = content?.mediaUrl ?? msg.media_url;

  return (
    <div className="in" style={side}>
      {media ? (
        <img src={media} alt="" style={{ width: 220, borderRadius: 20, display: 'block', boxShadow: '0 6px 18px rgba(30,16,90,.2)' }} />
      ) : (
        <div style={{
          padding: '12px 16px', fontSize: 15, lineHeight: 1.4,
          borderRadius: mine ? '20px 20px 6px 20px' : '20px 20px 20px 6px',
          background: mine ? 'var(--cobalt)' : 'var(--card)', color: mine ? '#fff' : 'var(--ink)',
          boxShadow: mine ? '0 5px 16px rgba(43,43,247,.32)' : '0 3px 12px rgba(30,16,90,.12)',
        }}>{body}</div>
      )}
      {stamp(left > 0 ? `apaga em ${left} s` : undefined)}
    </div>
  );
}
