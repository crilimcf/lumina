import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Camera, Eye, MessageSquare, Phone, Send, Timer, Video } from 'lucide-react';
import { api } from '../api.js';
import { Orb, Empty } from '../ui.jsx';
import { Bubble } from '../components/messages/Bubble.jsx';
import { Nav, TopActions } from '../components/AppChrome.jsx';
import { CallOverlay } from '../components/calls/CallOverlay.jsx';

function IncomingCall({ call, onAccept, onDecline }) {
  return <div role="dialog" aria-label={`Chamada recebida de ${call.name}`} style={{ position: 'fixed', inset: 0, zIndex: 170, background: 'rgba(7,5,17,.78)', backdropFilter: 'blur(16px)', display: 'grid', placeItems: 'center', color: '#fff', padding: 22 }}>
    <div style={{ width: '100%', maxWidth: 340, textAlign: 'center' }}><Orb p={call.palette} avatarUrl={call.avatar_url} s={104} /><div className="d" style={{ fontSize: 31, marginTop: 15, color: '#fff' }}>{call.name}</div><div style={{ marginTop: 7, opacity: .68 }}>{call.mode === 'video' ? 'Videochamada recebida' : 'Chamada áudio recebida'}</div><div style={{ display: 'flex', justifyContent: 'center', gap: 26, marginTop: 34 }}><button onClick={onDecline} aria-label="Recusar chamada" style={{ width: 66, height: 66, borderRadius: 99, border: 0, background: '#D94F62', color: '#fff', display: 'grid', placeItems: 'center', transform: 'rotate(135deg)' }}><Phone size={28} /></button><button onClick={onAccept} aria-label="Atender chamada" style={{ width: 66, height: 66, borderRadius: 99, border: 0, background: '#35C979', color: '#fff', display: 'grid', placeItems: 'center' }}>{call.mode === 'video' ? <Video size={27} /> : <Phone size={27} />}</button></div></div>
  </div>;
}

export function Conversas({ me, tab, setTab, comp, setComp, ping, unreadCount, threads, contacts = [], openContact, thread, setThread, msgs, text, setText, mode, setMode, onceFile, setOnceFile, sending, send, end }) {
  const [activeCall, setActiveCall] = useState(null);
  const [incoming, setIncoming] = useState(null);
  const [callBusy, setCallBusy] = useState(false);
  const availableContacts = useMemo(() => {
    const inThreads = new Set(threads.map(t => t.other_id));
    return contacts.filter(person => !inThreads.has(person.id));
  }, [contacts, threads]);

  useEffect(() => {
    if (activeCall) return;
    let alive = true;
    const check = async () => { try { const call = await api.calls.incoming(); if (alive) setIncoming(call); } catch {} };
    check();
    const timer = setInterval(check, 2500);
    return () => { alive = false; clearInterval(timer); };
  }, [activeCall]);

  const startCall = async (callMode) => {
    if (!thread || callBusy) return; setCallBusy(true);
    try { const call = await api.calls.start(thread.id, callMode); setActiveCall({ call, caller: true, person: { name: thread.name, handle: thread.handle, palette: thread.palette, avatar_url: thread.avatar_url } }); }
    catch (e) { ping(e.message); } finally { setCallBusy(false); }
  };
  const acceptIncoming = async () => {
    if (!incoming || callBusy) return; setCallBusy(true);
    try { const call = await api.calls.answer(incoming.id); setActiveCall({ call, caller: false, person: { name: incoming.name, handle: incoming.handle, palette: incoming.palette, avatar_url: incoming.avatar_url } }); setIncoming(null); }
    catch (e) { ping(e.message); setIncoming(null); } finally { setCallBusy(false); }
  };
  const declineIncoming = async () => { const current = incoming; setIncoming(null); if (!current) return; try { await api.calls.decline(current.id); } catch (e) { ping(e.message); } };

  if (thread) {
    const modes = [['normal', MessageSquare, 'Normal'], ['timer', Timer, 'Efémera'], ['once', Eye, 'Uma vez']];
    return <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--paper)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, borderBottom: '1px solid #E5E0F2' }}><button className="p" onClick={() => setThread(null)} aria-label="Voltar às conversas" style={{ padding: 10 }}><ArrowLeft size={16} /></button><Orb p={thread.palette} avatarUrl={thread.avatar_url} s={36} /><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{thread.name}</div><div className="m">@{thread.handle}</div></div><button className="p" onClick={() => startCall('audio')} disabled={callBusy} aria-label={`Ligar por áudio a ${thread.name}`} style={{ padding: 10 }}><Phone size={17} /></button><button className="p" onClick={() => startCall('video')} disabled={callBusy} aria-label={`Fazer videochamada com ${thread.name}`} style={{ padding: 10 }}><Video size={18} /></button></div>
      <div className="ns" style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>{msgs.length === 0 && <Empty>Diz olá.</Empty>}{msgs.map(m => <Bubble key={m.id} msg={m} mine={m.sender_id === me.id} onReveal={api.messages.reveal} />)}<div ref={end} /></div>
      <div style={{ padding: '0 14px calc(16px + env(safe-area-inset-bottom))' }}><div className="ns" style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 9 }}>{modes.map(([key, Icon, label]) => <button key={key} onClick={() => setMode(key)} className={`p p-sm${mode === key ? (key === 'normal' ? ' p-ink' : ' p-brand') : ''}`} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}><Icon size={13} />{label}</button>)}</div>{mode !== 'normal' && <p style={{ fontSize: 11.5, lineHeight: 1.4, color: 'var(--grey)', marginBottom: 9 }}>{mode === 'timer' ? 'Apaga-se pouco depois de ser aberta. Não impedimos capturas de ecrã.' : 'Abre uma vez e não volta. Não impedimos capturas de ecrã.'}</p>}{mode === 'once' ? <div style={{ display: 'grid', gap: 9 }}><label className="p" style={{ cursor: 'pointer', padding: 12, display: 'flex', alignItems: 'center', gap: 9, justifyContent: 'center' }}><Camera size={16} /><span>{onceFile ? onceFile.name : 'Escolher fotografia'}</span><input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => setOnceFile(e.target.files?.[0] || null)} /></label><button className="p p-brand" onClick={send} disabled={!onceFile || sending} aria-label="Enviar foto uma vez" style={{ padding: '12px 15px' }}>{sending ? 'A enviar…' : 'Enviar foto · uma vez'}</button></div> : <div style={{ display: 'flex', gap: 9 }}><input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder={mode === 'timer' ? 'Mensagem efémera…' : 'Escrever…'} /><button className={mode === 'timer' ? 'p p-brand' : 'p p-ink'} onClick={send} disabled={sending || !text.trim()} aria-label="Enviar mensagem" style={{ padding: '12px 15px' }}><Send size={16} /></button></div>}</div>
      {incoming && !activeCall && <IncomingCall call={incoming} onAccept={acceptIncoming} onDecline={declineIncoming} />}{activeCall && <CallOverlay {...activeCall} ping={ping} onClosed={() => setActiveCall(null)} />}
    </div>;
  }

  return <div style={{ minHeight: '100dvh', paddingBottom: 100, background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}><div style={{ maxWidth: 460, margin: '0 auto', padding: 20 }}><div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 26px' }}><h2 className="d" style={{ fontSize: 42, flex: 1 }}>Conver<span className="it">sas</span></h2><TopActions tab={tab} setTab={setTab} setThread={setThread} unreadCount={unreadCount} /></div>
    {threads.length === 0 && availableContacts.length === 0 && <Empty>Ainda sem contactos para conversar.<br />Segue alguém ou aceita um seguidor.</Empty>}
    {threads.length > 0 && <><div className="m" style={{ margin: '0 3px 10px' }}>Conversas</div><div style={{ display: 'grid', gap: 11 }}>{threads.map((t, i) => <button key={t.id} onClick={() => setThread({ id: t.id, name: t.name, handle: t.handle, palette: t.palette, avatar_url: t.avatar_url, other_id: t.other_id })} className="card in" style={{ border: 0, cursor: 'pointer', padding: 15, display: 'flex', gap: 13, alignItems: 'center', textAlign: 'left', animationDelay: `${i * 60}ms` }}><Orb p={t.palette} avatarUrl={t.avatar_url} s={44} /><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{t.name}</span><span style={{ display: 'block', fontSize: 14, color: 'var(--grey)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.body || 'Toca para conversar'}</span></span>{t.unread > 0 && <span style={{ width: 9, height: 9, borderRadius: 9, background: 'var(--cobalt)', boxShadow: '0 0 0 4px rgba(91,61,245,.16)' }} />}</button>)}</div></>}
    {availableContacts.length > 0 && <><div className="m" style={{ margin: threads.length ? '24px 3px 10px' : '0 3px 10px' }}>Pessoas</div><div style={{ display: 'grid', gap: 9 }}>{availableContacts.map((person, i) => <button key={person.id} onClick={() => openContact?.(person)} className="card in" style={{ border: 0, cursor: 'pointer', padding: 13, display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', animationDelay: `${Math.min(i, 8) * 45}ms` }}><Orb p={person.palette} avatarUrl={person.avatar_url} s={42} /><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>{person.name}</span><span style={{ display: 'block', fontSize: 12, color: 'var(--grey)', marginTop: 2 }}>@{person.handle}{person.following && person.follows_me ? ' · seguem-se' : person.follows_me ? ' · segue-te' : ' · a seguir'}</span></span><span style={{ width: 36, height: 36, borderRadius: 99, display: 'grid', placeItems: 'center', background: '#ECE9FF', color: 'var(--cobalt)' }}><MessageSquare size={17} /></span></button>)}</div></>}
  </div><Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} threads={threads} />{incoming && !activeCall && <IncomingCall call={incoming} onAccept={acceptIncoming} onDecline={declineIncoming} />}{activeCall && <CallOverlay {...activeCall} ping={ping} onClosed={() => setActiveCall(null)} />}</div>;
}
