import React from 'react';
import { ArrowLeft, Camera, Eye, MessageSquare, Send, Timer } from 'lucide-react';
import { api } from '../api.js';
import { Orb, Empty } from '../ui.jsx';
import { Bubble } from '../components/messages/Bubble.jsx';
import { Nav } from '../components/AppChrome.jsx';

export function Conversas({
  me, tab, setTab, coms, comp, setComp, ping,
  threads, thread, setThread, msgs, text, setText, mode, setMode,
  onceFile, setOnceFile, sending, send, end,
}) {
  if (thread) {
    const modes = [
      ['normal', MessageSquare, 'Normal'],
      ['timer', Timer, 'Efémera'],
      ['once', Eye, 'Uma vez'],
    ];
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--paper)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16 }}>
          <button className="p" onClick={() => setThread(null)} aria-label="Voltar às conversas" style={{ padding: 10 }}><ArrowLeft size={16} /></button>
          <Orb p={thread.palette} avatarUrl={thread.avatar_url} s={36} />
          <div><div style={{ fontSize: 15, fontWeight: 600 }}>{thread.name}</div><div className="m">@{thread.handle}</div></div>
        </div>

        <div className="ns" style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {msgs.length === 0 && <Empty>Diz olá.</Empty>}
          {msgs.map(m => <Bubble key={m.id} msg={m} mine={m.sender_id === me.id} onReveal={api.messages.reveal} />)}
          <div ref={end} />
        </div>

        <div style={{ padding: '0 14px 16px' }}>
          <div className="ns" style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 9 }}>
            {modes.map(([key, Icon, label]) => (
              <button key={key} onClick={() => setMode(key)}
                className={`p p-sm${mode === key ? (key === 'once' ? ' p-cr' : key === 'timer' ? ' p-co' : ' p-ink') : ''}`}
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon size={13} />{label}
              </button>
            ))}
          </div>

          {mode !== 'normal' && (
            <p style={{ fontSize: 11.5, lineHeight: 1.4, color: 'var(--grey)', marginBottom: 9 }}>
              {mode === 'timer'
                ? 'Apaga-se pouco depois de ser aberta. Não impedimos capturas de ecrã.'
                : 'Abre uma vez e não volta. Não impedimos capturas de ecrã.'}
            </p>
          )}

          {mode === 'once' ? (
            <div style={{ display: 'grid', gap: 9 }}>
              <label className="p" style={{ cursor: 'pointer', padding: 12, display: 'flex', alignItems: 'center', gap: 9, justifyContent: 'center' }}>
                <Camera size={16} />
                <span>{onceFile ? onceFile.name : 'Escolher fotografia'}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden
                  onChange={e => setOnceFile(e.target.files?.[0] || null)} />
              </label>
              <button className="p p-cr" onClick={send} disabled={!onceFile || sending}
                aria-label="Enviar foto uma vez" style={{ padding: '12px 15px' }}>
                {sending ? 'A enviar…' : 'Enviar foto · uma vez'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 9 }}>
              <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
                placeholder={mode === 'timer' ? 'Mensagem efémera…' : 'Escrever…'} />
              <button className={mode === 'timer' ? 'p p-co' : 'p p-ink'}
                onClick={send} disabled={sending} aria-label="Enviar mensagem" style={{ padding: '12px 15px' }}>
                <Send size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', paddingBottom: 100, background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
      <div style={{ maxWidth: 460, margin: '0 auto', padding: 20 }}>
        <h2 className="d" style={{ fontSize: 42, margin: '10px 0 26px' }}>Conver<span className="it">sas</span></h2>
        {threads.length === 0 && <Empty>Ainda sem conversas.<br />Abre o perfil de alguém para falar.</Empty>}
        <div style={{ display: 'grid', gap: 11 }}>
          {threads.map((t, i) => (
            <button key={t.id}
              onClick={() => setThread({ id: t.id, name: t.name, handle: t.handle, palette: t.palette, avatar_url: t.avatar_url })}
              className="card in"
              style={{ border: 0, cursor: 'pointer', padding: 15, display: 'flex', gap: 13, alignItems: 'center', textAlign: 'left', animationDelay: `${i * 60}ms` }}>
              <Orb p={t.palette} avatarUrl={t.avatar_url} s={44} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{t.name}</span>
                <span style={{ display: 'block', fontSize: 14, color: 'var(--grey)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.body || 'Sem mensagens'}
                </span>
              </span>
              {t.unread > 0 && <span style={{ width: 9, height: 9, borderRadius: 9, background: 'var(--coral)', boxShadow: '0 0 0 4px rgba(255,84,66,.2)' }} />}
            </button>
          ))}
        </div>
      </div>
      <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} coms={coms} threads={threads} ping={ping} />
    </div>
  );
}
