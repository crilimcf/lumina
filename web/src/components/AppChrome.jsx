import React, { useRef } from 'react';
import { Home, Image, Plus, Send, Sparkles, User, X } from 'lucide-react';
import { PAL } from '../ui.jsx';

export function Toast({ text }) {
  return text ? (
    <div className="in" style={{
      position: 'fixed', bottom: 92, left: '50%', transform: 'translateX(-50%)', zIndex: 70,
      background: 'var(--ink)', color: '#fff', padding: '13px 22px', borderRadius: 999,
      fontSize: 14, fontWeight: 600, maxWidth: '86%', textAlign: 'center',
      boxShadow: '0 12px 30px rgba(20,18,42,.36)',
    }}>{text}</div>
  ) : null;
}

export function Nav({ tab, setTab, setThread, setComp, coms, threads, ping }) {
  return (
    <div className="nav">
      {[['feed', Home, 'Feed'], ['invites', Sparkles, 'Convites'], ['new', Plus, 'Novo'], ['dms', Send, 'Conversas'], ['me', User, 'Perfil']].map(([k, I, l]) => (
        <button key={k} className={`nb${tab === k ? ' nb-on' : ''}`}
          onClick={() => {
            if (k === 'new') {
              if (!coms.length) return ping?.('Junta-te a uma comunidade primeiro, em Convites.');
              return setComp({ community: coms[0].id, title: 'Publicar' });
            }
            setTab(k); setThread(null);
          }}>
          <I size={21} strokeWidth={tab === k ? 2.4 : 1.9} />{l}
          {k === 'invites' && coms.some(c => c.invite_id && !c.answered) && <span className="dot-badge" />}
          {k === 'dms' && threads.some(t => t.unread > 0) && <span className="dot-badge" />}
        </button>
      ))}
    </div>
  );
}

export function Composer({ comp, setComp, coms, file, setFile, palette, setPalette, body, setBody, busy, publish }) {
  const fileInput = useRef(null);
  if (!comp) return null;
  return (
    <div onClick={() => !busy && setComp(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(24,18,60,.36)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', zIndex: 60 }}>
      <div onClick={e => e.stopPropagation()} className="in" style={{ background: 'linear-gradient(180deg,#F3F1FC,#E9E7F8)', borderRadius: '30px 30px 0 0', width: '100%', maxWidth: 560, margin: '0 auto', padding: '22px 20px calc(26px + env(safe-area-inset-bottom))' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <h3 className="d" style={{ fontSize: 26, flex: 1, lineHeight: 1 }}>{comp.title}</h3>
          <button className="p" onClick={() => setComp(null)} aria-label="Fechar" style={{ padding: 10 }}><X size={16} /></button>
        </div>

        {!comp.inviteId && coms.length > 1 && (
          <div className="ns" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 14 }}>
            {coms.map(c => (
              <button key={c.id} className={comp.community === c.id ? 'p p-sm p-ink' : 'p p-sm'}
                onClick={() => setComp({ ...comp, community: c.id })} style={{ flexShrink: 0 }}>{c.name}</button>
            ))}
          </div>
        )}

        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
          onChange={e => setFile(e.target.files?.[0] || null)} />
        <button className="p" onClick={() => fileInput.current?.click()}
          style={{ width: '100%', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Image size={15} />{file ? file.name.slice(0, 28) : 'Escolher uma foto'}
        </button>

        {!file && (
          <div className="scene" style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            {PAL.map((t, i) => (
              <button key={i} onClick={() => setPalette(i)} className="st"
                style={{ width: 48, height: 60, background: t.bg, border: 0, cursor: 'pointer', padding: 0, transform: palette === i ? 'translateY(-6px) scale(1.06)' : 'none' }}>
                <div className="gloss" />
              </button>
            ))}
          </div>
        )}

        <textarea rows={3} value={body} onChange={e => setBody(e.target.value)}
          placeholder="O que estás a ver?" style={{ marginBottom: 16, resize: 'none' }} maxLength={2000} />
        <button className="p p-cr" onClick={publish} disabled={!body.trim() || busy}
          style={{ width: '100%', padding: 15, fontSize: 15 }}>
          {busy ? 'A enviar…' : comp.inviteId ? 'Responder' : 'Publicar'}
        </button>
      </div>
    </div>
  );
}
