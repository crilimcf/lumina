import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, Crown, DoorOpen, LockKeyhole, MessageCircle, Plus, Search, Send, ShieldCheck, Sparkles, Trash2, Users, X } from 'lucide-react';
import { api } from '../api.js';
import { Empty, Orb } from '../ui.jsx';
import { Nav, Toast, TopActions } from '../components/AppChrome.jsx';

// Mantemos toda a implementação Ultra no código para a podermos reativar
// mais tarde sem reconstruir pagamentos. Enquanto esta flag estiver false,
// Ultra não aparece na descoberta, nos filtros nem na criação de salas.
const ULTRA_ROOMS_ENABLED = false;
const euro = cents => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format((cents || 0) / 100);
const roomTypes = [
  ['public', 'Pública', 'Qualquer pessoa Lumina pode entrar.', DoorOpen],
  ['private', 'Privada', 'Só aparece a pessoas convidadas por ti.', LockKeyhole],
  ...(ULTRA_ROOMS_ENABLED ? [['ultra', 'Ultra', 'Convite + pagamento. €2,99 para criar · €1,49 para entrar.', Crown]] : []),
];
const roomFilters = [
  ['all', 'Todas'],
  ['public', 'Públicas'],
  ['private', 'Privadas'],
  ...(ULTRA_ROOMS_ENABLED ? [['ultra', 'Ultra']] : []),
];

function AccessPill({ room }) {
  const cfg = room.visibility === 'public'
    ? ['Pública', DoorOpen, '#E9FFF4', '#157A4B']
    : room.visibility === 'private'
      ? ['Privada', LockKeyhole, '#F0EEFF', '#5542C9']
      : ['Ultra', Crown, '#FFF0F7', '#B82B70'];
  const [label, Icon, bg, color] = cfg;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 9px', borderRadius: 999, background: bg, color, fontSize: 10.5, fontWeight: 800 }}><Icon size={12} />{label}</span>;
}

function RoomCard({ room, me, onOpen, onRefresh, ping }) {
  const owner = room.creator_id === me.id;
  const act = async () => {
    try {
      if (room.joined && room.billing_state === 'active') return onOpen(room);
      if (owner && room.visibility === 'ultra' && room.billing_state !== 'active') {
        const out = await api.rooms.checkoutCreate(room.id);
        if (out.checkoutUrl) window.location.assign(out.checkoutUrl);
        else ping('Sala Ultra já ativa');
        return;
      }
      if (room.visibility === 'ultra' && !room.joined) {
        const out = await api.rooms.checkoutEntry(room.id);
        if (out.checkoutUrl) window.location.assign(out.checkoutUrl);
        else await api.rooms.join(room.id);
      } else {
        await api.rooms.join(room.id);
      }
      await onRefresh();
      const fresh = await api.rooms.get(room.id);
      if (fresh.joined) onOpen(fresh);
    } catch (e) { ping(e.message); }
  };

  const button = room.joined && room.billing_state === 'active' ? 'Entrar na sala'
    : owner && room.visibility === 'ultra' && room.billing_state !== 'active' ? `Ativar · ${euro(room.create_price_cents)}`
      : room.visibility === 'ultra' ? `Entrar · ${euro(room.entry_price_cents)}`
        : room.visibility === 'private' ? 'Aceitar convite' : 'Juntar-me';

  return (
    <article className="card in" style={{ overflow: 'hidden', padding: 0, border: 0 }}>
      <button onClick={act} style={{ width: '100%', border: 0, background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
        <div style={{ height: 174, position: 'relative', background: 'linear-gradient(135deg,#1B1038,#674CFF 55%,#A446FF)', overflow: 'hidden' }}>
          {room.image_url && <img src={room.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(7,4,20,.05),rgba(7,4,20,.68))' }} />
          <div style={{ position: 'absolute', top: 12, left: 12 }}><AccessPill room={room} /></div>
          <div style={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', alignItems: 'center', gap: 6, color: '#fff', background: 'rgba(5,3,16,.5)', backdropFilter: 'blur(8px)', padding: '7px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 800 }}><Users size={14} />{room.member_count}</div>
          <div style={{ position: 'absolute', left: 15, right: 70, bottom: 14, color: '#fff' }}>
            <div style={{ fontSize: 12, opacity: .75, marginBottom: 4 }}>@{room.creator_handle}</div>
            <div className="d" style={{ fontSize: 25, lineHeight: 1 }}>{room.name}</div>
          </div>
        </div>
        <div style={{ padding: 15 }}>
          <div style={{ fontSize: 16, fontWeight: 750, lineHeight: 1.28 }}>{room.topic}</div>
          {room.description && <div style={{ color: 'var(--grey)', fontSize: 13, lineHeight: 1.4, marginTop: 6 }}>{room.description}</div>}
          {room.visibility === 'ultra' && <div style={{ marginTop: 9, fontSize: 11.5, color: '#9A2B68' }}>{owner ? `Criação ${euro(room.create_price_cents)}` : `Entrada única ${euro(room.entry_price_cents)}`} · acesso discreto por convite</div>}
          <div className="p p-brand" style={{ marginTop: 12, justifyContent: 'center', width: '100%', padding: 12 }}>{button}</div>
        </div>
      </button>
    </article>
  );
}

function CreateRoom({ onClose, onCreated, ping }) {
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const preview = useMemo(() => file ? URL.createObjectURL(file) : null, [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const create = async () => {
    if (name.trim().length < 3 || topic.trim().length < 3) return ping('Dá um nome e um tópico à sala');
    setBusy(true);
    try {
      const imageUrl = file ? await api.upload(file) : null;
      const out = await api.rooms.create({ name: name.trim(), topic: topic.trim(), description: description.trim(), visibility, imageUrl });
      onCreated(out.room);
      if (out.checkoutUrl) window.location.assign(out.checkoutUrl);
      else if (out.paymentRequired) ping('Sala Ultra criada. Configura o pagamento Stripe para a ativar.');
      else ping('Sala criada');
      onClose();
    } catch (e) { ping(e.message); }
    finally { setBusy(false); }
  };

  return <div onClick={() => !busy && onClose()} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(17,10,46,.55)', backdropFilter: 'blur(7px)', display: 'flex', alignItems: 'flex-end' }}>
    <div onClick={e => e.stopPropagation()} className="in" style={{ width: '100%', maxWidth: 560, maxHeight: '94dvh', overflowY: 'auto', margin: '0 auto', borderRadius: '30px 30px 0 0', background: '#F5F3FF', padding: '20px 18px calc(24px + env(safe-area-inset-bottom))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}><div className="d" style={{ fontSize: 28, flex: 1 }}>Criar sala</div><button className="p" onClick={onClose}><X size={16} /></button></div>
      <input ref={input} type="file" accept="image/*" hidden onChange={e => { setFile(e.target.files?.[0] || null); e.target.value = ''; }} />
      <button onClick={() => input.current?.click()} style={{ width: '100%', height: 150, border: '1.5px dashed #BEB6DF', borderRadius: 22, overflow: 'hidden', background: preview ? '#111' : '#fff', display: 'grid', placeItems: 'center', marginBottom: 13, color: 'var(--ink)' }}>
        {preview ? <img src={preview} alt="Pré-visualização da sala" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ display: 'grid', placeItems: 'center', gap: 7 }}><Camera size={24} /><b>Foto da sala</b></span>}
      </button>
      <input placeholder="Nome da sala" maxLength={80} value={name} onChange={e => setName(e.target.value)} style={{ marginBottom: 10 }} />
      <input placeholder="Tópico principal" maxLength={180} value={topic} onChange={e => setTopic(e.target.value)} style={{ marginBottom: 10 }} />
      <textarea placeholder="Descrição (opcional)" maxLength={1000} rows={3} value={description} onChange={e => setDescription(e.target.value)} style={{ width: '100%', resize: 'none', marginBottom: 13 }} />
      <div className="m" style={{ marginBottom: 8 }}>Privacidade</div>
      <div style={{ display: 'grid', gap: 8, marginBottom: 15 }}>
        {roomTypes.map(([key, label, desc, Icon]) => <button key={key} onClick={() => setVisibility(key)} style={{ border: visibility === key ? '2px solid #5B45FF' : '1px solid #DCD6F0', borderRadius: 18, padding: 12, background: '#fff', textAlign: 'left', display: 'flex', gap: 11, alignItems: 'center' }}><span style={{ width: 38, height: 38, borderRadius: 99, display: 'grid', placeItems: 'center', background: visibility === key ? '#ECE9FF' : '#F4F2F8' }}><Icon size={18} /></span><span><b style={{ display: 'block' }}>{label}</b><span style={{ fontSize: 11.5, color: 'var(--grey)' }}>{desc}</span></span></button>)}
      </div>
      <button className="p p-brand" onClick={create} disabled={busy} style={{ width: '100%', padding: 14, justifyContent: 'center' }}>{busy ? 'A criar…' : visibility === 'ultra' ? 'Criar Sala Ultra · €2,99' : 'Criar sala'}</button>
    </div>
  </div>;
}

function RoomChat({ room, me, onBack, onRefresh, ping }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [people, setPeople] = useState([]);
  const [showInvite, setShowInvite] = useState(false);
  const owner = room.creator_id === me.id;

  useEffect(() => {
    let alive = true;
    const load = () => api.rooms.messages(room.id).then(r => alive && setMessages(r)).catch(e => alive && ping(e.message));
    load();
    const timer = setInterval(load, 3000);
    return () => { alive = false; clearInterval(timer); };
  }, [room.id]);

  useEffect(() => {
    if (!showInvite || search.trim().length < 2) return setPeople([]);
    const timer = setTimeout(() => api.users.search(search.trim()).then(setPeople).catch(() => setPeople([])), 250);
    return () => clearTimeout(timer);
  }, [search, showInvite]);

  const send = async () => {
    if (!text.trim()) return;
    const body = text.trim(); setText('');
    try { await api.rooms.send(room.id, body); setMessages(await api.rooms.messages(room.id)); }
    catch (e) { setText(body); ping(e.message); }
  };

  const remove = async (m) => {
    try { await api.rooms.removeMessage(room.id, m.id); setMessages(x => x.filter(v => v.id !== m.id)); }
    catch (e) { ping(e.message); }
  };

  return <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--paper)' }}>
    <header style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #E1DDF0' }}>
      <button className="p" onClick={onBack} aria-label="Voltar às salas"><ArrowLeft size={16} /></button>
      <div style={{ width: 42, height: 42, borderRadius: 14, overflow: 'hidden', background: '#25154F' }}>{room.image_url && <img src={room.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}</div>
      <div style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{room.name}</b><span className="m">{room.topic}</span></div>
      {owner && room.visibility !== 'public' && <button className="p" onClick={() => setShowInvite(v => !v)} aria-label="Convidar pessoas"><Plus size={17} /></button>}
    </header>
    {showInvite && owner && <div className="card in" style={{ margin: 12, padding: 12 }}><div style={{ display: 'flex', gap: 8 }}><Search size={16} style={{ marginTop: 12 }} /><input placeholder="Procurar utilizador" value={search} onChange={e => setSearch(e.target.value)} /></div><div style={{ display: 'grid', gap: 7, marginTop: 8 }}>{people.slice(0, 6).map(p => <button key={p.id} className="p" style={{ justifyContent: 'flex-start' }} onClick={async () => { try { await api.rooms.invite(room.id, p.id); ping(`${p.name} convidado`); setSearch(''); setPeople([]); } catch (e) { ping(e.message); } }}><Orb p={p.palette} avatarUrl={p.avatar_url} s={26} /> {p.name} <span className="m">@{p.handle}</span></button>)}</div></div>}
    <div className="ns" style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {!messages.length && <Empty>Esta sala está em silêncio. Começa o tópico.</Empty>}
      {messages.map(m => <div key={m.id} style={{ alignSelf: m.sender_id === me.id ? 'flex-end' : 'flex-start', maxWidth: '84%', display: 'flex', gap: 8, alignItems: 'flex-end', flexDirection: m.sender_id === me.id ? 'row-reverse' : 'row' }}><Orb p={m.palette} avatarUrl={m.avatar_url} s={26} /><div style={{ background: m.sender_id === me.id ? '#2E2AF3' : '#fff', color: m.sender_id === me.id ? '#fff' : 'var(--ink)', borderRadius: 18, padding: '9px 12px', boxShadow: '0 5px 16px rgba(25,18,70,.08)' }}><div style={{ fontSize: 10.5, opacity: .66, marginBottom: 3 }}>{m.sender_id === me.id ? 'Tu' : m.name}</div><div style={{ fontSize: 14.5, lineHeight: 1.4 }}>{m.body}</div>{m.edited_at && <div style={{ fontSize: 9.5, opacity: .55, marginTop: 3 }}>editada</div>}</div>{(m.sender_id === me.id || owner) && <button onClick={() => remove(m)} aria-label="Apagar mensagem" style={{ border: 0, background: 'none', color: '#C0B9D8', padding: 3 }}><Trash2 size={13} /></button>}</div>)}
    </div>
    <div style={{ padding: '10px 12px calc(12px + env(safe-area-inset-bottom))', display: 'flex', gap: 8, borderTop: '1px solid #E1DDF0', background: 'rgba(239,237,251,.95)' }}><input placeholder="Mensagem para a sala…" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} /><button className="p p-brand" onClick={send} disabled={!text.trim()} aria-label="Enviar para a sala"><Send size={17} /></button></div>
  </div>;
}

export function Salas({ me, tab, setTab, coms, setComp, threads, setThread, ping, toast, unreadCount }) {
  const [rooms, setRooms] = useState([]);
  const [active, setActive] = useState(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('all');

  const load = async () => { try { setRooms(await api.rooms.list()); } catch (e) { ping(e.message); } };
  useEffect(() => { load(); }, []);

  const visible = rooms.filter(r => (ULTRA_ROOMS_ENABLED || r.visibility !== 'ultra') && (filter === 'all' || r.visibility === filter));
  if (active) return <RoomChat room={active} me={me} ping={ping} onBack={() => { setActive(null); load(); }} onRefresh={load} />;

  return <div style={{ minHeight: '100dvh', paddingBottom: 100, background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '18px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 10px' }}><div style={{ flex: 1 }}><h2 className="d" style={{ fontSize: 40, margin: 0 }}>Sa<span className="it">las</span></h2><div className="m" style={{ marginTop: 4 }}>Tópicos vivos, sem poluir o feed.</div></div><button className="p p-brand p-sm" onClick={() => setCreating(true)}><Plus size={15} /> Criar</button><TopActions tab={tab} setTab={setTab} setThread={setThread} unreadCount={unreadCount} /></div>
      <div style={{ display: 'flex', gap: 7, overflowX: 'auto', padding: '9px 0 15px' }}>{roomFilters.map(([k,l]) => <button key={k} onClick={() => setFilter(k)} className={`p p-sm${filter===k?' p-ink':''}`} style={{ flexShrink: 0 }}>{l}</button>)}</div>
      {visible.length === 0 ? <Empty>Não há salas nesta categoria.<br />Cria a primeira.</Empty> : <div style={{ display: 'grid', gap: 13 }}>{visible.map(room => <RoomCard key={room.id} room={room} me={me} onOpen={setActive} onRefresh={load} ping={ping} />)}</div>}
      <div className="card" style={{ padding: 14, marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}><ShieldCheck size={20} color="var(--cobalt)" /><div style={{ fontSize: 12.5, lineHeight: 1.4 }}><b>Privacidade real.</b> Salas privadas só aparecem a pessoas convidadas por quem as criou.</div></div>
    </div>
    <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} coms={coms} threads={threads} ping={ping} />
    <Toast text={toast} />
    {creating && <CreateRoom onClose={() => setCreating(false)} onCreated={room => setRooms(current => [room, ...current])} ping={ping} />}
  </div>;
}