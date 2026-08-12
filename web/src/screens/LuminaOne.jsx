import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Camera, Clock3, Compass, Flame, Image as ImageIcon, Lock, MapPin,
  Pause, Play, Plus, Radio, RefreshCw, Search, Send, Share2, SlidersHorizontal,
  Sparkles, Trash2, Unlock, Users, Video, X,
} from 'lucide-react';
import { api } from '../api.js';
import { Orb } from '../ui.jsx';
import '../lumina-one.css';

const TABS = [
  ['pulse', Flame, 'Pulso'],
  ['lumes', Camera, 'Lumes'],
  ['capsules', Clock3, 'Cápsulas'],
  ['agora', Compass, 'Agora'],
];
const EFFECTS = [
  ['normal', 'Normal'],
  ['mirror', 'Espelho'],
  ['mono', 'P&B'],
  ['vivid', 'Vivo'],
];
const CONTEXTS = [
  ['auto', 'Auto'], ['casa', 'Casa'], ['evento', 'Evento'], ['viagem', 'Viagem'], ['jogo', 'Jogo'], ['foco', 'Foco'],
];

function lumeEffectStyle(effect) {
  if (effect === 'mirror') return { transform:'scaleX(-1)' };
  if (effect === 'mono') return { filter:'grayscale(1) contrast(1.08)' };
  if (effect === 'vivid') return { filter:'saturate(1.45) contrast(1.08)' };
  return {};
}

function PulseMedia({ item }) {
  const ref = useRef(null);
  const video = item.media_mime?.startsWith('video/') || /\.(mp4|mov|webm)(?:$|\?)/i.test(item.media_url || '');
  useEffect(() => {
    if (!video || !ref.current || !('IntersectionObserver' in window)) return undefined;
    const node = ref.current;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= .62) node.play().catch(() => {});
      else node.pause();
    }, { threshold:[0,.62,1] });
    observer.observe(node);
    return () => observer.disconnect();
  }, [video, item.id]);
  if (!item.media_url) return <div className="one-pulse-text-only"><span>{item.body}</span></div>;
  return video
    ? <video ref={ref} className="one-pulse-media" src={item.media_url} muted loop playsInline preload="metadata" />
    : <img className="one-pulse-media" src={item.media_url} alt="" loading="lazy" />;
}

function LumeViewer({ lume, onClose }) {
  if (!lume) return null;
  return <div className="one-lume-viewer" role="dialog" aria-modal="true" aria-label={`Lume de ${lume.name || 'utilizador'}`}>
    <button className="one-overlay-close" onClick={onClose} aria-label="Fechar Lume"><X size={20}/></button>
    <div className="one-lume-viewer-copy"><b>{lume.name}</b><span>@{lume.handle} · só uma vez</span></div>
    <img src={lume.media_url} alt="" style={lumeEffectStyle(lume.effect)} />
    <div className="one-lume-viewer-note">Depois de fechares, este Lume desaparece para ti.</div>
  </div>;
}

function TogetherPanel({ sessionId, onClose, ping, onOpenLive }) {
  const [session, setSession] = useState(null);
  const [source, setSource] = useState(null);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      const next = await api.one.togetherSession(sessionId);
      setSession(next);
      if (!source) {
        const preview = await api.one.source(next.source_type, next.source_id).catch(() => null);
        if (preview) setSource(preview);
      }
    } catch (error) {
      ping(error.message);
      onClose();
    } finally { setLoading(false); }
  }, [sessionId, source, ping, onClose]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!sessionId) return undefined;
    const id = setInterval(load, 2500);
    return () => clearInterval(id);
  }, [sessionId, load]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !session || session.mine) return;
    const desired = Math.max(0, Number(session.state?.positionMs || 0) / 1000);
    if (Math.abs(video.currentTime - desired) > 1.6 && Number.isFinite(desired)) video.currentTime = desired;
    if (session.state?.playing) video.play().catch(() => {});
    else video.pause();
  }, [session?.state?.playing, session?.state?.positionMs, session?.mine]);

  const updateState = async (patch) => {
    if (!session?.mine) return;
    try {
      const next = await api.one.setTogetherState(session.id, patch);
      setSession(prev => ({ ...prev, ...next }));
    } catch (error) { ping(error.message); }
  };

  const share = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('one', 'together');
    url.searchParams.set('id', session.id);
    const text = `Vem ver isto comigo na Lumina · ${session.title}`;
    try {
      if (navigator.share) await navigator.share({ title:'Lumina Juntos', text, url:url.toString() });
      else { await navigator.clipboard.writeText(url.toString()); ping('Convite copiado'); }
    } catch {}
  };

  if (loading) return <div className="one-together-overlay"><div className="one-state">A preparar Juntos…</div></div>;
  if (!session) return null;
  const isVideo = source?.media_mime?.startsWith('video/') || source?.recording_mime?.startsWith('video/');
  const videoUrl = source?.media_url || source?.recording_url || null;

  return <div className="one-together-overlay" role="dialog" aria-modal="true" aria-label="Sessão Juntos">
    <header className="one-together-header">
      <button onClick={onClose} aria-label="Fechar Juntos"><X size={19}/></button>
      <div><span>JUNTOS</span><b>{session.title || 'Sessão Lumina'}</b></div>
      <button onClick={share} aria-label="Partilhar convite"><Share2 size={18}/></button>
    </header>
    <div className="one-together-stage">
      {source?.type === 'post' && isVideo && videoUrl && <video
        ref={videoRef}
        src={videoUrl}
        playsInline
        controls
        onPlay={e => updateState({ playing:true, positionMs:Math.round(e.currentTarget.currentTime*1000) })}
        onPause={e => updateState({ playing:false, positionMs:Math.round(e.currentTarget.currentTime*1000) })}
        onSeeked={e => updateState({ positionMs:Math.round(e.currentTarget.currentTime*1000) })}
      />}
      {source?.type === 'post' && !isVideo && source?.media_url && <img src={source.media_url} alt="" />}
      {source?.type === 'post' && <div className="one-together-caption"><b>{source.name || source.handle}</b><p>{source.body}</p></div>}
      {source?.type === 'radar' && <div className="one-together-radar">{source.image_url&&<img src={source.image_url} alt=""/>}<span>RADAR</span><h3>{source.title}</h3><p>{source.summary || source.body}</p></div>}
      {source?.type === 'live' && <div className="one-together-live"><Radio size={30}/><h3>{source.title}</h3><p>{source.status === 'live' ? 'Está em direto agora.' : 'Replay do direto.'}</p><button className="one-primary" onClick={()=>onOpenLive?.(source.id)}>Abrir direto na Lumina</button></div>}
      {!source && <div className="one-state">A carregar o conteúdo partilhado…</div>}
    </div>
    <div className="one-together-bottom">
      <div className="one-members-row">{session.members?.slice(0,6).map(member=><Orb key={member.id} p={member.palette} avatarUrl={member.avatar_url} s={34}/>)}<span>{session.members?.length || 1} juntos</span></div>
      {session.mine ? <div className="one-sync-controls"><button onClick={()=>updateState({playing:!session.state?.playing,positionMs:Math.round((videoRef.current?.currentTime||0)*1000)})}>{session.state?.playing?<Pause size={16}/>:<Play size={16}/>} {session.state?.playing?'Pausar':'Reproduzir'}</button><span>Tu controlas a sessão</span></div> : <div className="one-sync-status"><span className={session.state?.playing?'is-live':''}/>{session.state?.playing?'A reproduzir com o anfitrião':'À espera do anfitrião'}</div>}
    </div>
  </div>;
}

export function LuminaOne({ me, onBack, ping, onOpenLive }) {
  const initialOne = new URLSearchParams(window.location.search).get('one');
  const [tab, setTab] = useState(['pulse','lumes','capsules','agora'].includes(initialOne) ? initialOne : 'pulse');
  const [pulseScope, setPulseScope] = useState('for-you');
  const [pulse, setPulse] = useState([]);
  const [pulseLoading, setPulseLoading] = useState(false);
  const [lumes, setLumes] = useState([]);
  const [lumeViewer, setLumeViewer] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraFacing, setCameraFacing] = useState('user');
  const [cameraError, setCameraError] = useState('');
  const [lumeFile, setLumeFile] = useState(null);
  const [lumeEffect, setLumeEffect] = useState('normal');
  const [lumeBusy, setLumeBusy] = useState(false);
  const videoCameraRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const lumePreviewUrl = useMemo(() => lumeFile ? URL.createObjectURL(lumeFile) : null, [lumeFile]);

  const [capsules, setCapsules] = useState([]);
  const [capsule, setCapsule] = useState(null);
  const [capsuleCreate, setCapsuleCreate] = useState(false);
  const [capsuleTitle, setCapsuleTitle] = useState('');
  const [capsuleDescription, setCapsuleDescription] = useState('');
  const [capsuleUnlock, setCapsuleUnlock] = useState('');
  const [capsuleBody, setCapsuleBody] = useState('');
  const [capsuleFile, setCapsuleFile] = useState(null);
  const [capsuleBusy, setCapsuleBusy] = useState(false);
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteResults, setInviteResults] = useState([]);

  const [prefs, setPrefs] = useState({ boost_topics:[], mute_topics:[], context_mode:'auto', local_region:'' });
  const [boostInput, setBoostInput] = useState('');
  const [muteInput, setMuteInput] = useState('');
  const [localRegion, setLocalRegion] = useState('');
  const [localItems, setLocalItems] = useState([]);
  const [together, setTogether] = useState([]);
  const [togetherId, setTogetherId] = useState(null);
  const [joinCode, setJoinCode] = useState('');

  const loadPulse = useCallback(async () => {
    setPulseLoading(true);
    try { setPulse((await api.one.pulse(pulseScope)).items || []); }
    catch (error) { ping(error.message); }
    finally { setPulseLoading(false); }
  }, [pulseScope, ping]);
  const loadLumes = useCallback(async () => { try { setLumes(await api.one.lumes()); } catch (error) { ping(error.message); } }, [ping]);
  const loadCapsules = useCallback(async () => { try { setCapsules(await api.one.capsules()); } catch (error) { ping(error.message); } }, [ping]);
  const loadAgora = useCallback(async () => {
    try {
      const [nextPrefs, sessions] = await Promise.all([api.one.preferences(), api.one.together()]);
      setPrefs(nextPrefs);
      setBoostInput((nextPrefs.boost_topics || []).join(', '));
      setMuteInput((nextPrefs.mute_topics || []).join(', '));
      setLocalRegion(nextPrefs.local_region || '');
      setTogether(sessions || []);
      if (nextPrefs.local_region) setLocalItems((await api.one.local(nextPrefs.local_region)).items || []);
    } catch (error) { ping(error.message); }
  }, [ping]);

  useEffect(() => { if (tab === 'pulse') loadPulse(); }, [tab, loadPulse]);
  useEffect(() => { if (tab === 'lumes') loadLumes(); }, [tab, loadLumes]);
  useEffect(() => { if (tab === 'capsules') loadCapsules(); }, [tab, loadCapsules]);
  useEffect(() => { if (tab === 'agora') loadAgora(); }, [tab, loadAgora]);
  useEffect(() => () => { if (lumePreviewUrl) URL.revokeObjectURL(lumePreviewUrl); }, [lumePreviewUrl]);

  useEffect(() => {
    if (!cameraOpen) return undefined;
    let cancelled = false;
    const start = async () => {
      setCameraError('');
      cameraStreamRef.current?.getTracks().forEach(track => track.stop());
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:cameraFacing }, width:{ ideal:1280 }, height:{ ideal:1280 } }, audio:false });
        if (cancelled) return stream.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = stream;
        if (videoCameraRef.current) { videoCameraRef.current.srcObject = stream; await videoCameraRef.current.play().catch(()=>{}); }
      } catch { setCameraError('Não consegui abrir a câmara. Confirma a permissão do iPhone.'); }
    };
    start();
    return () => { cancelled = true; cameraStreamRef.current?.getTracks().forEach(track=>track.stop()); cameraStreamRef.current=null; };
  }, [cameraOpen, cameraFacing]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedId = params.get('id');
    if (params.get('one') !== 'together' || !sharedId) return;
    api.one.joinTogether(sharedId).then(() => { setTogetherId(sharedId); setTab('agora'); }).catch(error => ping(error.message));
  }, [ping]);

  useEffect(() => {
    const term = inviteQuery.trim();
    if (!capsule || term.length < 2) { setInviteResults([]); return undefined; }
    let alive = true;
    const id = setTimeout(() => api.users.search(term).then(rows => alive && setInviteResults(rows.slice(0,8))).catch(()=>{}), 280);
    return () => { alive=false;clearTimeout(id); };
  }, [inviteQuery, capsule?.id]);

  const captureLume = async () => {
    const video = videoCameraRef.current;
    if (!video?.videoWidth) return ping('Espera um instante pela câmara');
    const side = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - side) / 2;
    const sy = (video.videoHeight - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1080;
    canvas.getContext('2d').drawImage(video, sx, sy, side, side, 0, 0, 1080, 1080);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .9));
    if (!blob) return ping('Não foi possível tirar a fotografia');
    setLumeFile(new File([blob], `lume-${Date.now()}.jpg`, { type:'image/jpeg' }));
    setCameraOpen(false);
  };

  const publishLume = async () => {
    if (!lumeFile || lumeBusy) return;
    setLumeBusy(true);
    try {
      const mediaUrl = await api.upload(lumeFile);
      await api.one.createLume({ mediaUrl, effect:lumeEffect });
      setLumeFile(null); setLumeEffect('normal'); await loadLumes(); ping('Lume enviado aos teus amigos');
    } catch (error) { ping(error.message); }
    finally { setLumeBusy(false); }
  };

  const openLume = async (lume) => {
    try {
      const opened = lume.mine ? lume : await api.one.openLume(lume.id);
      setLumeViewer({ ...lume, ...opened });
    } catch (error) { ping(error.message); await loadLumes(); }
  };

  const createCapsule = async () => {
    if (!capsuleTitle.trim()) return;
    setCapsuleBusy(true);
    try {
      const unlockAt = capsuleUnlock ? new Date(capsuleUnlock).toISOString() : null;
      const created = await api.one.createCapsule({ title:capsuleTitle, description:capsuleDescription, unlockAt });
      setCapsuleCreate(false); setCapsuleTitle(''); setCapsuleDescription(''); setCapsuleUnlock('');
      await loadCapsules(); setCapsule(await api.one.capsule(created.id));
    } catch (error) { ping(error.message); }
    finally { setCapsuleBusy(false); }
  };

  const openCapsule = async (id) => {
    try { setCapsule(await api.one.capsule(id)); setInviteQuery(''); }
    catch (error) { ping(error.message); }
  };

  const addCapsuleItem = async () => {
    if (!capsule || (!capsuleBody.trim() && !capsuleFile) || capsuleBusy) return;
    setCapsuleBusy(true);
    try {
      const mediaUrl = capsuleFile ? await api.upload(capsuleFile) : null;
      await api.one.addCapsuleItem(capsule.id, { body:capsuleBody.trim(), mediaUrl });
      setCapsuleBody(''); setCapsuleFile(null); setCapsule(await api.one.capsule(capsule.id)); ping(capsule.locked?'Guardado dentro da Cápsula':'Adicionado à Cápsula');
    } catch (error) { ping(error.message); }
    finally { setCapsuleBusy(false); }
  };

  const invite = async (person) => {
    try { await api.one.addCapsuleMember(capsule.id, person.id); setCapsule(await api.one.capsule(capsule.id)); setInviteQuery(''); ping(`${person.name} entrou na Cápsula`); }
    catch (error) { ping(error.message); }
  };

  const startTogether = async (item) => {
    try {
      const created = await api.one.createTogether({ sourceType:'post', sourceId:item.id, title:`${item.name}: ${String(item.body||'').slice(0,70)}` });
      setTogetherId(created.id); setTab('agora');
    } catch (error) { ping(error.message); }
  };

  const saveAgora = async () => {
    try {
      const boostTopics = boostInput.split(',').map(v=>v.trim()).filter(Boolean);
      const muteTopics = muteInput.split(',').map(v=>v.trim()).filter(Boolean);
      const next = await api.one.setPreferences({ boostTopics, muteTopics, contextMode:prefs.context_mode, localRegion });
      setPrefs(next);
      setLocalItems(localRegion.trim() ? (await api.one.local(localRegion.trim())).items || [] : []);
      ping('O teu Pulso foi afinado');
    } catch (error) { ping(error.message); }
  };

  const joinTogether = async () => {
    const id = joinCode.trim();
    if (!id) return;
    try { await api.one.joinTogether(id); setTogetherId(id); setJoinCode(''); }
    catch (error) { ping(error.message); }
  };

  return <div className="lumina-one">
    <header className="one-header">
      <button className="one-back" onClick={onBack} aria-label="Voltar ao Feed"><ArrowLeft size={19}/></button>
      <div className="one-title-wrap"><div className="one-eyebrow"><Sparkles size={13}/> LUMINA ONE</div><h1>Tudo acontece <i>aqui.</i></h1><p>Cria, descobre e vive com a tua rede sem saltar entre apps.</p></div>
    </header>
    <nav className="one-tabs" aria-label="Experiências Lumina One">{TABS.map(([key,Icon,label])=><button key={key} className={tab===key?'is-on':''} onClick={()=>setTab(key)}><Icon size={18}/><span>{label}</span></button>)}</nav>

    {tab==='pulse' && <main className="one-pulse-page">
      <div className="one-section-toolbar"><div><span>PULSO</span><b>Descoberta em movimento</b></div><div className="one-segment"><button className={pulseScope==='for-you'?'is-on':''} onClick={()=>setPulseScope('for-you')}>Para ti</button><button className={pulseScope==='friends'?'is-on':''} onClick={()=>setPulseScope('friends')}>Amigos</button></div></div>
      {pulseLoading && <div className="one-state">A afinar o teu Pulso…</div>}
      {!pulseLoading && !pulse.length && <div className="one-state"><Flame size={25}/><b>O Pulso está a aquecer</b><span>Publica ou segue mais pessoas para aparecer conteúdo aqui.</span></div>}
      <div className="one-pulse-stack">{pulse.map(item=><article key={item.id} className="one-pulse-card">
        <PulseMedia item={item}/><div className="one-pulse-shade"/>
        <div className="one-pulse-copy"><div className="one-pulse-author"><Orb p={item.author_palette} avatarUrl={item.author_avatar_url} s={36}/><div><b>{item.name}</b><span>@{item.handle}</span></div></div><p>{item.body}</p><div className="one-pulse-meta"><span>🔥 {item.fires||0}</span><span>👍 {item.likes||0}</span><span>💬 {item.comments||0}</span></div></div>
        <div className="one-pulse-actions"><button onClick={()=>startTogether(item)} aria-label="Ver Juntos"><Users size={20}/><span>Juntos</span></button><button onClick={()=>{navigator.clipboard?.writeText(`${window.location.origin}/?post=${item.id}`).then(()=>ping('Ligação copiada')).catch(()=>{})}} aria-label="Partilhar"><Share2 size={20}/><span>Partilhar</span></button></div>
      </article>)}</div>
      <button className="one-floating-tune" onClick={()=>setTab('agora')}><SlidersHorizontal size={17}/> Afinar o meu Pulso</button>
    </main>}

    {tab==='lumes' && <main className="one-content one-lumes-page">
      <section className="one-hero-card one-lume-hero"><div><span>LUMES</span><h2>Agora. Uma vez. <i>Real.</i></h2><p>Fotografias tiradas neste momento, só para amigos mútuos. Abrem uma vez e desaparecem.</p></div><button className="one-primary" onClick={()=>setCameraOpen(true)}><Camera size={18}/> Tirar um Lume</button></section>
      {lumeFile && <section className="one-lume-draft"><div className="one-lume-preview"><img src={lumePreviewUrl} alt="Pré-visualização do Lume" style={lumeEffectStyle(lumeEffect)}/><button onClick={()=>setLumeFile(null)} aria-label="Descartar"><X size={17}/></button></div><div className="one-effect-row">{EFFECTS.map(([key,label])=><button key={key} className={lumeEffect===key?'is-on':''} onClick={()=>setLumeEffect(key)}>{label}</button>)}</div><button className="one-primary" disabled={lumeBusy} onClick={publishLume}>{lumeBusy?'A enviar…':'Enviar Lume'}</button></section>}
      <section><div className="one-section-head"><div><span>À tua espera</span><b>Lumes dos teus amigos</b></div><button onClick={loadLumes} aria-label="Atualizar Lumes"><RefreshCw size={16}/></button></div><div className="one-lume-grid">{lumes.map(lume=><button key={lume.id} className="one-lume-tile" onClick={()=>openLume(lume)}><div><Orb p={lume.palette} avatarUrl={lume.avatar_url} s={54}/><span className="one-lume-glow"/></div><b>{lume.mine?'O teu Lume':lume.name.split(' ')[0]}</b><span>{lume.mine?'ativo':'toca para abrir'}</span></button>)}</div>{!lumes.length&&<div className="one-state">Ainda não há Lumes. O primeiro pode ser teu.</div>}</section>
    </main>}

    {tab==='capsules' && <main className="one-content one-capsules-page">
      {!capsule && <><section className="one-hero-card"><div><span>CÁPSULAS</span><h2>Memórias que <i>esperam.</i></h2><p>Junta amigos, fotografias, vídeos e mensagens. Decide quando a Cápsula pode ser aberta.</p></div><button className="one-primary" onClick={()=>setCapsuleCreate(true)}><Plus size={18}/> Nova Cápsula</button></section><div className="one-capsule-list">{capsules.map(item=><button key={item.id} className="one-capsule-card" onClick={()=>openCapsule(item.id)}><div className={item.locked?'is-locked':''}>{item.locked?<Lock size={21}/>:<Unlock size={21}/>}</div><section><b>{item.title}</b><p>{item.description||'Memória partilhada'}</p><span>{item.member_count} pessoas · {item.item_count} memórias</span></section><time>{item.locked&&item.unlock_at?`abre ${new Date(item.unlock_at).toLocaleDateString('pt-PT')}`:'aberta'}</time></button>)}</div>{!capsules.length&&<div className="one-state">Cria uma Cápsula para uma viagem, festa, casamento ou qualquer momento que queiras guardar com outras pessoas.</div>}</>}
      {capsule && <section className="one-capsule-detail"><button className="one-inline-back" onClick={()=>{setCapsule(null);loadCapsules()}}><ArrowLeft size={16}/> Todas as Cápsulas</button><div className="one-capsule-detail-head"><div className={capsule.locked?'is-locked':''}>{capsule.locked?<Lock size={24}/>:<Unlock size={24}/>}</div><div><span>{capsule.locked?'FECHADA':'ABERTA'}</span><h2>{capsule.title}</h2><p>{capsule.description}</p>{capsule.locked&&capsule.unlock_at&&<time>Abre em {new Date(capsule.unlock_at).toLocaleString('pt-PT')}</time>}</div></div>
        <div className="one-members-row">{capsule.members?.map(member=><Orb key={member.id} p={member.palette} avatarUrl={member.avatar_url} s={34}/>)}<span>{capsule.members?.length||1} pessoas</span></div>
        {capsule.role==='owner'&&<div className="one-invite"><Search size={16}/><input value={inviteQuery} onChange={e=>setInviteQuery(e.target.value)} placeholder="Adicionar amigo à Cápsula"/>{inviteResults.length>0&&<div className="one-invite-results">{inviteResults.map(person=><button key={person.id} onClick={()=>invite(person)}><Orb p={person.palette} avatarUrl={person.avatar_url} s={30}/><span><b>{person.name}</b>@{person.handle}</span><Plus size={15}/></button>)}</div>}</div>}
        <div className="one-capsule-add"><textarea value={capsuleBody} onChange={e=>setCapsuleBody(e.target.value)} placeholder={capsule.locked?'Escreve algo para abrir mais tarde…':'Adicionar uma memória…'} maxLength={1200}/><label><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" onChange={e=>setCapsuleFile(e.target.files?.[0]||null)}/>{capsuleFile?.type.startsWith('video/')?<Video size={17}/>:<ImageIcon size={17}/>}<span>{capsuleFile?capsuleFile.name:'Foto ou vídeo'}</span></label><button className="one-primary" disabled={capsuleBusy||(!capsuleBody.trim()&&!capsuleFile)} onClick={addCapsuleItem}><Send size={17}/>{capsuleBusy?'A guardar…':'Guardar na Cápsula'}</button></div>
        {capsule.locked?<div className="one-locked-message"><Lock size={28}/><b>O conteúdo está selado</b><span>Podes continuar a adicionar memórias. Ninguém as vê antes da data de abertura.</span></div>:<div className="one-capsule-items">{capsule.items?.map(item=><article key={item.id}>{item.media_url&&(item.media_mime?.startsWith('video/')?<video src={item.media_url} controls playsInline/>:<img src={item.media_url} alt=""/>)}{item.body&&<p>{item.body}</p>}<span>{item.name} · {new Date(item.created_at).toLocaleDateString('pt-PT')}</span></article>)}</div>}
        {capsule.role==='owner'&&<button className="one-danger" onClick={async()=>{if(!confirm('Apagar esta Cápsula?'))return;try{await api.one.removeCapsule(capsule.id);setCapsule(null);await loadCapsules()}catch(error){ping(error.message)}}}><Trash2 size={16}/> Apagar Cápsula</button>}
      </section>}
    </main>}

    {tab==='agora' && <main className="one-content one-agora-page">
      <section className="one-hero-card one-agora-hero"><div><span>AGORA</span><h2>A rede adapta-se <i>a ti.</i></h2><p>Tu dizes o que queres ver e em que contexto estás. O algoritmo deixa de ser uma caixa preta.</p></div></section>
      <section className="one-settings-card"><div className="one-section-head"><div><span>O MEU ALGORITMO</span><b>Afinar o Pulso</b></div><SlidersHorizontal size={20}/></div><label>Quero ver mais<input value={boostInput} onChange={e=>setBoostInput(e.target.value)} placeholder="viagens, carros, tecnologia"/></label><label>Quero ver menos<input value={muteInput} onChange={e=>setMuteInput(e.target.value)} placeholder="política, futebol…"/></label><div className="one-contexts"><span>Modo de agora</span><div>{CONTEXTS.map(([key,label])=><button key={key} className={prefs.context_mode===key?'is-on':''} onClick={()=>setPrefs(prev=>({...prev,context_mode:key}))}>{label}</button>)}</div></div><label>Onde estás / o que queres descobrir<div className="one-region-input"><MapPin size={17}/><input value={localRegion} onChange={e=>setLocalRegion(e.target.value)} placeholder="Porto, Lisboa, Braga…"/></div></label><button className="one-primary" onClick={saveAgora}>Guardar e adaptar a Lumina</button></section>
      <section><div className="one-section-head"><div><span>RADAR LOCAL</span><b>{localRegion||'Perto de ti'}</b></div><MapPin size={19}/></div>{localRegion&&!localItems.length&&<div className="one-state">Ainda não encontrei conteúdo Radar associado a esta zona.</div>}<div className="one-local-grid">{localItems.map(item=><article key={item.id}>{item.image_url&&<img src={item.image_url} alt=""/>}<span>{item.type==='event'?'EVENTO':'RADAR'}{item.region?` · ${item.region}`:''}</span><b>{item.title}</b><p>{item.summary}</p>{item.starts_at&&<time>{new Date(item.starts_at).toLocaleString('pt-PT')}</time>}<button onClick={async()=>{try{const s=await api.one.createTogether({sourceType:'radar',sourceId:item.id,title:item.title});setTogetherId(s.id)}catch(error){ping(error.message)}}}><Users size={16}/> Ver Juntos</button></article>)}</div></section>
      <section className="one-juntos-section"><div className="one-section-head"><div><span>JUNTOS</span><b>Partilhar o momento</b></div><Users size={20}/></div><div className="one-join"><input value={joinCode} onChange={e=>setJoinCode(e.target.value)} placeholder="Código/ID da sessão"/><button onClick={joinTogether}>Entrar</button></div><div className="one-together-list">{together.map(item=><button key={item.id} onClick={()=>setTogetherId(item.id)}><div><Users size={18}/></div><section><b>{item.title}</b><span>{item.participants} juntos · {item.source_type}</span></section><Play size={16}/></button>)}</div>{!together.length&&<div className="one-state">No Pulso ou Radar, toca em <b>Juntos</b> para iniciar uma sessão.</div>}</section>
    </main>}

    {cameraOpen && <div className="one-camera" role="dialog" aria-modal="true" aria-label="Câmara Lume"><video ref={videoCameraRef} playsInline muted style={lumeEffectStyle(lumeEffect)}/><div className="one-camera-top"><button onClick={()=>setCameraOpen(false)} aria-label="Fechar câmara"><X size={20}/></button><b>Lume</b><button onClick={()=>setCameraFacing(v=>v==='user'?'environment':'user')} aria-label="Trocar câmara"><RefreshCw size={19}/></button></div>{cameraError&&<div className="one-camera-error">{cameraError}</div>}<div className="one-camera-effects">{EFFECTS.map(([key,label])=><button key={key} className={lumeEffect===key?'is-on':''} onClick={()=>setLumeEffect(key)}>{label}</button>)}</div><button className="one-shutter" onClick={captureLume} aria-label="Tirar fotografia"><span/></button></div>}
    {lumeViewer&&<LumeViewer lume={lumeViewer} onClose={()=>{setLumeViewer(null);loadLumes()}}/>}
    {capsuleCreate&&<div className="one-sheet-backdrop" role="dialog" aria-modal="true" aria-label="Nova Cápsula"><div className="one-sheet"><div className="one-sheet-head"><div><span>NOVA CÁPSULA</span><h3>Guardar para <i>depois.</i></h3></div><button onClick={()=>setCapsuleCreate(false)} aria-label="Fechar"><X size={18}/></button></div><label>Nome<input value={capsuleTitle} onChange={e=>setCapsuleTitle(e.target.value)} placeholder="Verão 2026" maxLength={80}/></label><label>Descrição<textarea value={capsuleDescription} onChange={e=>setCapsuleDescription(e.target.value)} placeholder="O que estamos a guardar?" maxLength={400}/></label><label>Quando pode abrir? <span>(opcional)</span><input type="datetime-local" value={capsuleUnlock} onChange={e=>setCapsuleUnlock(e.target.value)}/></label><button className="one-primary" disabled={capsuleBusy||!capsuleTitle.trim()} onClick={createCapsule}>{capsuleBusy?'A criar…':'Criar Cápsula'}</button></div></div>}
    {togetherId&&<TogetherPanel sessionId={togetherId} onClose={()=>{setTogetherId(null);loadAgora()}} ping={ping} onOpenLive={onOpenLive}/>} 
  </div>;
}
