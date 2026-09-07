import { isNativeApp, nativeApiOrigin, nativeAuthHeaders } from './native/session.js';
import { readCachedRadarLocation } from './radar-location.js';

const BASE = isNativeApp ? nativeApiOrigin : (import.meta.env.VITE_API_URL || '/api');
const SAFE = new Set(['GET','HEAD']);
let csrfToken = '';
let toastTimer = null;

const LANG = (() => {
  const values = [...(navigator.languages || []), navigator.language].filter(Boolean);
  const key = values.map(v=>String(v).toLowerCase().split(/[-_]/)[0]).find(v=>['pt','fr','es','en'].includes(v));
  return key || 'en';
})();

const COPY = {
  pt:{
    live:'LUME 2.0', hero:'Não publiques só. Vive com alguém.', sub:'Envia um Lume a amigos, responde em cadeia ou cria um Lume coletivo. Sem likes. Só pessoas e o momento.', direct:'Direto', directSub:'Uma fotografia para amigos escolhidos.', collective:'Coletivo', collectiveSub:'Todos acrescentam. No fim nasce uma memória.', light:'Acender um Lume', active:'EM CURSO', activeTitle:'Lumes vivos', recaps:'MEMÓRIAS', recapTitle:'Recaps coletivos', emptyLume:'Ainda não tens Lumes ativos. Acende o primeiro com alguém.', emptyRecap:'Os Lumes coletivos aparecem aqui depois de terminarem.', refresh:'Atualizar', choose:'Escolhe com quem', title:'Nome do Lume', titlePh:'Jantar no Porto', caption:'Legenda opcional', captionPh:'O que está a acontecer?', photo:'Tirar fotografia', send:'Enviar Lume', sending:'A enviar…', reply:'Responder', add:'Adicionar ao Lume', once:'Abrir uma vez', viewed:'Já visto', mine:'O teu', captured:'Capturado na Lumina', edited:'Editado com IA', generated:'Gerado com IA', close:'Fechar', camera:'Câmara', waitCamera:'A abrir a câmara…', cameraFail:'Não foi possível abrir a câmara. Usa a câmara do dispositivo.', useCamera:'Abrir câmara do dispositivo', selectFriend:'Escolhe pelo menos um amigo.', needPhoto:'Tira primeiro uma fotografia.', sent:'Lume aceso ✦', added:'Momento adicionado ao Lume', recap:'Ver recap', people:'pessoas', moments:'momentos',
    agora:'AGORA', agoraHero:'Faz acontecer. Agora.', agoraSub:'Diz o que te apetece fazer e deixa os teus amigos entrarem. A localização pública é aproximada; o ponto exato só aparece depois de entrares.', createPlan:'Criar um Agora', happening:'A acontecer na tua rede', noAgora:'Ninguém lançou um Agora ainda. Podes ser o primeiro.', join:'Estou dentro', open:'Abrir', joined:'Dentro', plan:'Novo Agora', what:'O que queres fazer?', whatPh:'Café daqui a uma hora?', note:'Detalhes', notePh:'Quem alinha?', approx:'Zona aproximada', exact:'Ponto de encontro privado', exactPh:'Nome do café / morada / instruções', exactHelp:'Só participantes veem este campo.', when:'Quando?', duration:'Disponível durante', capacity:'Máximo de pessoas', publish:'Publicar Agora', privatePoint:'PONTO DE ENCONTRO · SÓ PARTICIPANTES', chat:'Conversa temporária', message:'Escreve ao grupo…', sendMsg:'Enviar', collectiveLume:'Acender Lume coletivo', leave:'Sair', finish:'Terminar', entered:'Entraste no plano', planCreated:'Agora publicado',
    network:'Dos meus', networkKicker:'RADAR · REDE DE CONFIANÇA', networkHero:'O que está a circular entre os teus.', networkSub:'Conteúdos guardados ou partilhados por amigos mútuos. Mostramos a força do sinal, nunca quem fez o quê.', networkEmpty:'Ainda não há sinais suficientes na tua rede. Guarda ou partilha conteúdos do Radar e eles começam a circular entre amigos.', networkCount:n=>`${n} ${n===1?'pessoa':'pessoas'} da tua rede`, save:'Guardar', saved:'Guardado', share:'Partilhar', source:'Abrir fonte', signalSaved:'Guardado. Pode agora circular entre os teus amigos.', signalShared:'Partilhado com a tua rede.',
  },
  fr:{
    live:'LUME 2.0', hero:'Ne publie pas seulement. Vis-le avec quelqu’un.', sub:'Envoie un Lume à des amis, réponds en chaîne ou crée un Lume collectif. Pas de likes. Des personnes et le moment.', direct:'Direct', directSub:'Une photo pour les amis choisis.', collective:'Collectif', collectiveSub:'Tout le monde ajoute. À la fin, un souvenir naît.', light:'Allumer un Lume', active:'EN COURS', activeTitle:'Lumes vivants', recaps:'SOUVENIRS', recapTitle:'Recaps collectifs', emptyLume:'Aucun Lume actif. Allume le premier avec quelqu’un.', emptyRecap:'Les Lumes collectifs apparaissent ici une fois terminés.', refresh:'Actualiser', choose:'Choisis avec qui', title:'Nom du Lume', titlePh:'Dîner à Porto', caption:'Légende facultative', captionPh:'Que se passe-t-il ?', photo:'Prendre une photo', send:'Envoyer le Lume', sending:'Envoi…', reply:'Répondre', add:'Ajouter au Lume', once:'Ouvrir une fois', viewed:'Déjà vu', mine:'Le tien', captured:'Capturé dans Lumina', edited:'Modifié avec IA', generated:'Généré avec IA', close:'Fermer', camera:'Caméra', waitCamera:'Ouverture de la caméra…', cameraFail:'Impossible d’ouvrir la caméra. Utilise la caméra de l’appareil.', useCamera:'Ouvrir la caméra de l’appareil', selectFriend:'Choisis au moins un ami.', needPhoto:'Prends d’abord une photo.', sent:'Lume allumé ✦', added:'Moment ajouté au Lume', recap:'Voir le recap', people:'personnes', moments:'moments',
    agora:'MAINTENANT', agoraHero:'Fais quelque chose. Maintenant.', agoraSub:'Dis ce que tu veux faire et laisse tes amis te rejoindre. La localisation publique reste approximative ; le point exact n’apparaît qu’après avoir rejoint.', createPlan:'Créer un Maintenant', happening:'En cours dans ton réseau', noAgora:'Personne n’a lancé de Maintenant. Tu peux être le premier.', join:'J’en suis', open:'Ouvrir', joined:'Participant', plan:'Nouveau Maintenant', what:'Que veux-tu faire ?', whatPh:'Un café dans une heure ?', note:'Détails', notePh:'Qui est partant ?', approx:'Zone approximative', exact:'Point de rendez-vous privé', exactPh:'Nom du café / adresse / instructions', exactHelp:'Seuls les participants voient ce champ.', when:'Quand ?', duration:'Disponible pendant', capacity:'Nombre maximum', publish:'Publier Maintenant', privatePoint:'RENDEZ-VOUS · PARTICIPANTS UNIQUEMENT', chat:'Conversation temporaire', message:'Écrire au groupe…', sendMsg:'Envoyer', collectiveLume:'Allumer un Lume collectif', leave:'Quitter', finish:'Terminer', entered:'Tu as rejoint le plan', planCreated:'Maintenant publié',
    network:'Les miens', networkKicker:'RADAR · RÉSEAU DE CONFIANCE', networkHero:'Ce qui circule parmi les tiens.', networkSub:'Contenus enregistrés ou partagés par des amis mutuels. Nous montrons la force du signal, jamais qui a fait quoi.', networkEmpty:'Pas encore assez de signaux dans ton réseau. Enregistre ou partage des contenus du Radar pour les faire circuler.', networkCount:n=>`${n} ${n===1?'personne':'personnes'} de ton réseau`, save:'Enregistrer', saved:'Enregistré', share:'Partager', source:'Ouvrir la source', signalSaved:'Enregistré. Il peut maintenant circuler parmi tes amis.', signalShared:'Partagé avec ton réseau.',
  },
  es:{
    live:'LUME 2.0', hero:'No publiques solamente. Vívelo con alguien.', sub:'Envía un Lume a amigos, responde en cadena o crea un Lume colectivo. Sin likes. Personas y el momento.', direct:'Directo', directSub:'Una foto para amigos elegidos.', collective:'Colectivo', collectiveSub:'Todos añaden. Al final nace un recuerdo.', light:'Encender un Lume', active:'EN CURSO', activeTitle:'Lumes vivos', recaps:'RECUERDOS', recapTitle:'Recaps colectivos', emptyLume:'Aún no tienes Lumes activos. Enciende el primero con alguien.', emptyRecap:'Los Lumes colectivos aparecen aquí cuando terminan.', refresh:'Actualizar', choose:'Elige con quién', title:'Nombre del Lume', titlePh:'Cena en Oporto', caption:'Texto opcional', captionPh:'¿Qué está pasando?', photo:'Hacer foto', send:'Enviar Lume', sending:'Enviando…', reply:'Responder', add:'Añadir al Lume', once:'Abrir una vez', viewed:'Ya visto', mine:'El tuyo', captured:'Capturado en Lumina', edited:'Editado con IA', generated:'Generado con IA', close:'Cerrar', camera:'Cámara', waitCamera:'Abriendo cámara…', cameraFail:'No se pudo abrir la cámara. Usa la cámara del dispositivo.', useCamera:'Abrir cámara del dispositivo', selectFriend:'Elige al menos un amigo.', needPhoto:'Primero haz una foto.', sent:'Lume encendido ✦', added:'Momento añadido al Lume', recap:'Ver recap', people:'personas', moments:'momentos',
    agora:'AHORA', agoraHero:'Haz que pase. Ahora.', agoraSub:'Di qué te apetece hacer y deja que tus amigos se unan. La ubicación pública es aproximada; el punto exacto solo aparece al entrar.', createPlan:'Crear un Ahora', happening:'Pasando en tu red', noAgora:'Nadie ha lanzado un Ahora todavía. Puedes ser el primero.', join:'Me apunto', open:'Abrir', joined:'Dentro', plan:'Nuevo Ahora', what:'¿Qué quieres hacer?', whatPh:'¿Café dentro de una hora?', note:'Detalles', notePh:'¿Quién se apunta?', approx:'Zona aproximada', exact:'Punto de encuentro privado', exactPh:'Nombre del café / dirección / instrucciones', exactHelp:'Solo los participantes ven este campo.', when:'¿Cuándo?', duration:'Disponible durante', capacity:'Máximo de personas', publish:'Publicar Ahora', privatePoint:'PUNTO DE ENCUENTRO · SOLO PARTICIPANTES', chat:'Conversación temporal', message:'Escribe al grupo…', sendMsg:'Enviar', collectiveLume:'Encender Lume colectivo', leave:'Salir', finish:'Terminar', entered:'Te has unido al plan', planCreated:'Ahora publicado',
    network:'Los míos', networkKicker:'RADAR · RED DE CONFIANZA', networkHero:'Lo que circula entre los tuyos.', networkSub:'Contenido guardado o compartido por amigos mutuos. Mostramos la fuerza de la señal, nunca quién hizo qué.', networkEmpty:'Aún no hay suficientes señales en tu red. Guarda o comparte contenido del Radar y empezará a circular.', networkCount:n=>`${n} ${n===1?'persona':'personas'} de tu red`, save:'Guardar', saved:'Guardado', share:'Compartir', source:'Abrir fuente', signalSaved:'Guardado. Ahora puede circular entre tus amigos.', signalShared:'Compartido con tu red.',
  },
  en:{
    live:'LUME 2.0', hero:'Don’t just post it. Live it with someone.', sub:'Send a Lume to friends, reply in a chain, or create a collective Lume. No likes. Just people and the moment.', direct:'Direct', directSub:'One photo for selected friends.', collective:'Collective', collectiveSub:'Everyone adds. A shared memory appears at the end.', light:'Light a Lume', active:'HAPPENING', activeTitle:'Live Lumes', recaps:'MEMORIES', recapTitle:'Collective recaps', emptyLume:'No active Lumes yet. Light the first one with someone.', emptyRecap:'Collective Lumes appear here after they finish.', refresh:'Refresh', choose:'Choose who', title:'Lume name', titlePh:'Dinner in Porto', caption:'Optional caption', captionPh:'What is happening?', photo:'Take photo', send:'Send Lume', sending:'Sending…', reply:'Reply', add:'Add to Lume', once:'Open once', viewed:'Already seen', mine:'Yours', captured:'Captured in Lumina', edited:'Edited with AI', generated:'Generated with AI', close:'Close', camera:'Camera', waitCamera:'Opening camera…', cameraFail:'Could not open the camera. Use the device camera instead.', useCamera:'Open device camera', selectFriend:'Choose at least one friend.', needPhoto:'Take a photo first.', sent:'Lume lit ✦', added:'Moment added to the Lume', recap:'View recap', people:'people', moments:'moments',
    agora:'NOW', agoraHero:'Make something happen. Now.', agoraSub:'Say what you want to do and let your friends join. Public location stays approximate; the exact meeting point only appears after joining.', createPlan:'Create a Now', happening:'Happening in your network', noAgora:'Nobody has started a Now yet. You can be first.', join:'I’m in', open:'Open', joined:'Joined', plan:'New Now', what:'What do you want to do?', whatPh:'Coffee in an hour?', note:'Details', notePh:'Who is in?', approx:'Approximate area', exact:'Private meeting point', exactPh:'Cafe name / address / instructions', exactHelp:'Only participants can see this field.', when:'When?', duration:'Available for', capacity:'Maximum people', publish:'Publish Now', privatePoint:'MEETING POINT · PARTICIPANTS ONLY', chat:'Temporary chat', message:'Message the group…', sendMsg:'Send', collectiveLume:'Light collective Lume', leave:'Leave', finish:'End', entered:'You joined the plan', planCreated:'Now published',
    network:'My people', networkKicker:'RADAR · TRUST NETWORK', networkHero:'What is circulating among your people.', networkSub:'Content saved or shared by mutual friends. We show signal strength, never who did what.', networkEmpty:'Not enough signals in your network yet. Save or share Radar content and it will start circulating among friends.', networkCount:n=>`${n} ${n===1?'person':'people'} in your network`, save:'Save', saved:'Saved', share:'Share', source:'Open source', signalSaved:'Saved. It can now circulate among your friends.', signalShared:'Shared with your network.',
  },
};
const C = COPY[LANG];

const esc = value => String(value ?? '').replace(/[&<>'"]/g, char=>({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
const initials = value => String(value || 'L').trim().split(/\s+/).slice(0,2).map(x=>x[0] || '').join('').toUpperCase().slice(0,2) || 'L';
const provenanceLabel = value => value === 'edited_ai' ? C.edited : value === 'generated_ai' ? C.generated : C.captured;
const effectStyle = effect => effect === 'mirror' ? 'transform:scaleX(-1)' : effect === 'mono' ? 'filter:grayscale(1) contrast(1.08)' : effect === 'vivid' ? 'filter:saturate(1.45) contrast(1.08)' : '';
const timeText = value => {
  if (!value) return '';
  try { return new Intl.DateTimeFormat(navigator.language || undefined,{hour:'2-digit',minute:'2-digit'}).format(new Date(value)); }
  catch { return ''; }
};

function notify(text) {
  let node = document.querySelector('.social-loop-toast');
  if (!node) {
    node = document.createElement('div');
    node.className = 'social-loop-toast';
    document.body.appendChild(node);
  }
  node.textContent = text;
  node.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>node.classList.remove('is-on'),2600);
}

async function ensureCsrf() {
  if (isNativeApp || csrfToken) return csrfToken;
  const res = await fetch(`${BASE}/auth/me`, { credentials:'include', headers:nativeAuthHeaders() });
  if (!res.ok) throw new Error('session');
  const data = await res.json();
  csrfToken = data.csrf || '';
  return csrfToken;
}

async function request(path, { method='GET', body } = {}) {
  const headers = { ...nativeAuthHeaders() };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (!SAFE.has(method) && !isNativeApp) {
    const token = await ensureCsrf();
    if (token) headers['x-csrf-token'] = token;
  }
  const res = await fetch(`${BASE}${path}`, {
    method, credentials:'include', headers,
    body:body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error || 'Lumina');
  return data;
}

async function uploadFile(file) {
  const signed = await request('/uploads/sign', { method:'POST', body:{ mime:file.type || 'image/jpeg', bytes:file.size } });
  const put = await fetch(signed.uploadUrl, { method:'PUT', headers:{ 'content-type':file.type || 'image/jpeg' }, body:file });
  if (!put.ok) throw new Error('Upload');
  const confirmed = await request('/uploads/confirm', { method:'POST', body:{ key:signed.key } });
  return confirmed.url;
}

function closeBackdrop(node) {
  try { node?._cleanup?.(); } catch {}
  node?.remove();
}

async function capturePhoto() {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'social-loop-backdrop';
    backdrop.innerHTML = `<div class="social-loop-sheet">
      <div class="social-loop-sheet-head"><div><span>${esc(C.live)}</span><h3>${esc(C.camera)}</h3></div><button class="social-loop-close" data-close aria-label="${esc(C.close)}">×</button></div>
      <div class="social-loop-camera"><video playsinline muted></video><div class="social-loop-camera-controls"><button class="social-loop-switch-camera" data-switch aria-label="switch">↻</button><button class="social-loop-shutter" data-shot aria-label="${esc(C.photo)}"></button></div></div>
      <div class="social-loop-error" data-camera-error style="display:none"></div>
      <div class="social-loop-capture-fallback" data-fallback style="display:none"><label>${esc(C.useCamera)}<input type="file" accept="image/*" capture="environment"></label></div>
    </div>`;
    document.body.appendChild(backdrop);
    const video = backdrop.querySelector('video');
    const errorNode = backdrop.querySelector('[data-camera-error]');
    const fallback = backdrop.querySelector('[data-fallback]');
    let stream = null;
    let facing = 'environment';
    let finished = false;

    const finish = file => {
      if (finished) return;
      finished = true;
      stream?.getTracks().forEach(track=>track.stop());
      backdrop.remove();
      resolve(file || null);
    };
    const start = async () => {
      stream?.getTracks().forEach(track=>track.stop());
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera');
        stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:facing }, width:{ideal:1440}, height:{ideal:1440} }, audio:false });
        video.srcObject = stream;
        await video.play();
        errorNode.style.display = 'none'; fallback.style.display = 'none';
      } catch {
        errorNode.textContent = C.cameraFail;
        errorNode.style.display = '';
        fallback.style.display = '';
      }
    };
    backdrop.querySelector('[data-close]').onclick = ()=>finish(null);
    backdrop.addEventListener('pointerdown', event=>{ if (event.target === backdrop) finish(null); });
    backdrop.querySelector('[data-switch]').onclick = async () => { facing = facing === 'user' ? 'environment' : 'user'; await start(); };
    backdrop.querySelector('[data-shot]').onclick = async () => {
      if (!video.videoWidth) return notify(C.waitCamera);
      const side = Math.min(video.videoWidth, video.videoHeight);
      const sx = (video.videoWidth-side)/2, sy=(video.videoHeight-side)/2;
      const canvas = document.createElement('canvas');
      canvas.width=1080; canvas.height=1080;
      const context = canvas.getContext('2d');
      if (facing === 'user') { context.translate(1080,0); context.scale(-1,1); }
      context.drawImage(video,sx,sy,side,side,0,0,1080,1080);
      const blob = await new Promise(r=>canvas.toBlob(r,'image/jpeg',.9));
      if (blob) finish(new File([blob],`lume-${Date.now()}.jpg`,{type:'image/jpeg'}));
    };
    fallback.querySelector('input').onchange = event => finish(event.target.files?.[0] || null);
    void start();
  });
}

// -------------------------------------------------------------------------
// Lume 2.0
// -------------------------------------------------------------------------
let lumeMount = null;
let lumeLoading = false;
let focusedChainId = '';

function enhanceLumes() {
  const page = document.querySelector('.one-lumes-page');
  if (!page || page.dataset.socialLoops === '1') return;
  page.dataset.socialLoops = '1';
  page.classList.add('is-social-loops-ready');
  lumeMount = document.createElement('section');
  lumeMount.className = 'social-lume2-mount';
  page.prepend(lumeMount);
  void renderLumes();
}

async function renderLumes() {
  if (!lumeMount || lumeLoading) return;
  lumeLoading = true;
  lumeMount.innerHTML = `<div class="social-loop-panel social-lume2-hero"><div class="social-loop-inner"><div class="social-loop-kicker"><span class="dot"></span>${esc(C.live)}</div><h2 class="social-loop-title">${esc(C.hero.split('. ')[0])}. <i>${esc((C.hero.split('. ')[1] || '').replace('.',''))}</i></h2><p class="social-loop-subtitle">${esc(C.sub)}</p><div class="social-lume2-mode-note"><div><b>↗ ${esc(C.direct)}</b><span>${esc(C.directSub)}</span></div><div><b>✦ ${esc(C.collective)}</b><span>${esc(C.collectiveSub)}</span></div></div><div class="social-loop-actions"><button class="social-loop-primary" data-new-lume>✦ ${esc(C.light)}</button></div></div></div><div class="social-loop-empty">…</div>`;
  lumeMount.querySelector('[data-new-lume]').onclick = ()=>openLumeComposer();
  try {
    const [chains,recaps] = await Promise.all([
      request('/one/viral/lume-chains'),
      request('/one/viral/lume-recaps'),
    ]);
    const active = (chains || []).filter(item=>item.active);
    const chainHtml = active.length ? active.map(chain=>`<button class="social-lume2-card${focusedChainId===chain.id?' is-focused':''}" data-chain="${esc(chain.id)}"><div class="social-lume2-orb">${esc(initials(chain.owner_name))}</div><div class="social-lume2-copy"><b>${esc(chain.title || (chain.mode==='collective'?C.collective:C.direct))}</b><span>${esc(chain.owner_name || chain.owner_handle)} · ${chain.member_count} ${esc(C.people)} · ${chain.entry_count} ${esc(C.moments)}</span></div><div class="social-lume2-meta">${Number(chain.unseen_count)>0?`<span class="social-lume2-unseen">${chain.unseen_count}</span>`:''}<span>${chain.mode==='collective'?'✦':'↗'} ${esc(chain.mode==='collective'?C.collective:C.direct)}</span></div></button>`).join('') : `<div class="social-loop-empty">${esc(C.emptyLume)}</div>`;
    const recapHtml = (recaps || []).length ? recaps.map(item=>`<button class="social-lume2-card social-lume2-recap" data-recap="${esc(item.id)}"><div class="social-lume2-orb">✦</div><div class="social-lume2-copy"><b>${esc(item.title || C.collective)}</b><span>${item.member_count} ${esc(C.people)} · ${item.entry_count} ${esc(C.moments)}</span></div><div class="social-lume2-meta"><span>${esc(C.recap)} ›</span></div></button>`).join('') : `<div class="social-loop-empty">${esc(C.emptyRecap)}</div>`;
    lumeMount.insertAdjacentHTML('beforeend', `<section class="social-lume2-section"><div class="social-loop-section-head"><div><span>${esc(C.active)}</span><b>${esc(C.activeTitle)}</b></div><button class="social-loop-refresh" data-refresh-lumes aria-label="${esc(C.refresh)}">↻</button></div><div class="social-lume2-list">${chainHtml}</div></section><section class="social-lume2-section"><div class="social-loop-section-head"><div><span>${esc(C.recaps)}</span><b>${esc(C.recapTitle)}</b></div></div><div class="social-lume2-list">${recapHtml}</div></section>`);
    lumeMount.querySelector('[data-refresh-lumes]').onclick = ()=>{ lumeLoading=false; void renderLumes(); };
    lumeMount.querySelectorAll('[data-chain]').forEach(btn=>btn.onclick=()=>openChain(btn.dataset.chain));
    lumeMount.querySelectorAll('[data-recap]').forEach(btn=>btn.onclick=()=>openRecap(btn.dataset.recap));
  } catch (error) {
    lumeMount.insertAdjacentHTML('beforeend', `<div class="social-loop-error">${esc(error.message)}</div>`);
  } finally { lumeLoading=false; }
}

async function openLumeComposer({ chainId='', replyToId='' } = {}) {
  let friends = [];
  let chain = null;
  try {
    if (chainId) chain = await request(`/one/viral/lume-chains/${encodeURIComponent(chainId)}`);
    else friends = await request('/one/viral/lume-friends');
  } catch (error) { return notify(error.message); }

  const backdrop = document.createElement('div');
  backdrop.className='social-loop-backdrop';
  const friendHtml = friends.map(person=>`<label class="social-loop-friend"><input type="checkbox" value="${esc(person.id)}"><span class="social-loop-friend-avatar">${esc(initials(person.name))}</span><span class="social-loop-friend-copy"><b>${esc(person.name)}</b><span>@${esc(person.handle)}</span></span></label>`).join('');
  backdrop.innerHTML=`<div class="social-loop-sheet"><div class="social-loop-sheet-head"><div><span>${esc(C.live)}</span><h3>${esc(chainId ? (replyToId?C.reply:C.add) : C.light)}</h3></div><button class="social-loop-close" data-close>×</button></div>
    ${chainId?`<div class="social-agora-private"><b>✦</b><span>${esc(chain?.title || C.collective)} · ${chain?.members?.length || 0} ${esc(C.people)}</span></div>`:`<div class="social-loop-segment"><button data-mode="direct" class="is-on"><b>↗ ${esc(C.direct)}</b><span>${esc(C.directSub)}</span></button><button data-mode="collective"><b>✦ ${esc(C.collective)}</b><span>${esc(C.collectiveSub)}</span></button></div><label class="social-loop-field">${esc(C.choose)}<div class="social-loop-friends">${friendHtml || `<div class="social-loop-empty">${esc(C.emptyLume)}</div>`}</div></label><label class="social-loop-field" data-title-field style="display:none">${esc(C.title)}<input maxlength="80" placeholder="${esc(C.titlePh)}"></label>`}
    <label class="social-loop-field">${esc(C.caption)}<input data-caption maxlength="180" placeholder="${esc(C.captionPh)}"></label>
    <div data-photo-slot class="social-loop-empty">${esc(C.needPhoto)}</div>
    <div class="social-loop-effects"><button data-effect="normal" class="is-on">Normal</button><button data-effect="mirror">↔</button><button data-effect="mono">P&B</button><button data-effect="vivid">Vivid</button></div>
    <div class="social-loop-actions"><button class="social-loop-secondary" data-photo>📷 ${esc(C.photo)}</button><button class="social-loop-primary" data-submit disabled>${esc(chainId?C.add:C.send)}</button></div><div class="social-loop-error" data-error style="display:none"></div></div>`;
  document.body.appendChild(backdrop);
  let mode='direct', photo=null, photoUrl='', effect='normal', busy=false;
  const submit = backdrop.querySelector('[data-submit]');
  const slot = backdrop.querySelector('[data-photo-slot]');
  const errorNode = backdrop.querySelector('[data-error]');
  const close = ()=>{ if(photoUrl)URL.revokeObjectURL(photoUrl); closeBackdrop(backdrop); };
  backdrop.querySelector('[data-close]').onclick=close;
  backdrop.addEventListener('pointerdown',e=>{if(e.target===backdrop)close()});
  backdrop.querySelectorAll('[data-mode]').forEach(btn=>btn.onclick=()=>{
    mode=btn.dataset.mode; backdrop.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('is-on',x===btn));
    const field=backdrop.querySelector('[data-title-field]'); if(field)field.style.display=mode==='collective'?'':'none';
  });
  backdrop.querySelectorAll('[data-effect]').forEach(btn=>btn.onclick=()=>{effect=btn.dataset.effect;backdrop.querySelectorAll('[data-effect]').forEach(x=>x.classList.toggle('is-on',x===btn));const img=slot.querySelector('img');if(img)img.style.cssText=effectStyle(effect)});
  backdrop.querySelector('[data-photo]').onclick=async()=>{
    const file=await capturePhoto(); if(!file)return;
    if(photoUrl)URL.revokeObjectURL(photoUrl); photo=file;photoUrl=URL.createObjectURL(file);slot.className='social-loop-camera';slot.innerHTML=`<img alt="" src="${photoUrl}" style="${effectStyle(effect)}"><span class="social-provenance" style="position:absolute;left:10px;top:10px">✓ ${esc(C.captured)}</span>`;submit.disabled=false;
  };
  submit.onclick=async()=>{
    if(busy||!photo)return; const selected=[...backdrop.querySelectorAll('.social-loop-friend input:checked')].map(x=>x.value);
    if(!chainId&&!selected.length){errorNode.textContent=C.selectFriend;errorNode.style.display='';return}
    busy=true;submit.disabled=true;submit.textContent=C.sending;errorNode.style.display='none';
    try{
      const mediaUrl=await uploadFile(photo); const caption=backdrop.querySelector('[data-caption]').value.trim();
      if(chainId){await request(`/one/viral/lume-chains/${encodeURIComponent(chainId)}/entries`,{method:'POST',body:{mediaUrl,effect,caption,provenance:'captured',replyToId:replyToId||null}});notify(C.added)}
      else{const title=backdrop.querySelector('[data-title-field] input')?.value.trim()||'';await request('/one/viral/lume-chains',{method:'POST',body:{mode,title,recipientIds:selected,mediaUrl,effect,caption,provenance:'captured'}});notify(C.sent)}
      close();focusedChainId=chainId; lumeLoading=false;await renderLumes();
    }catch(error){errorNode.textContent=error.message;errorNode.style.display='';submit.disabled=false;submit.textContent=chainId?C.add:C.send}finally{busy=false}
  };
}

async function openChain(id) {
  focusedChainId=id;
  let data; try{data=await request(`/one/viral/lume-chains/${encodeURIComponent(id)}`)}catch(error){return notify(error.message)}
  const backdrop=document.createElement('div');backdrop.className='social-loop-backdrop';
  const members=(data.members||[]).map(m=>`<span title="${esc(m.name)}">${esc(initials(m.name))}</span>`).join('');
  const entries=(data.entries||[]).map(entry=>{
    const state=entry.mine?'is-mine':entry.viewed?'is-viewed':''; const action=data.recap_ready?`<button data-recap-now>${esc(C.recap)}</button>`:entry.mine?`<button disabled>${esc(C.mine)}</button>`:entry.viewed?`<button disabled>${esc(C.viewed)}</button>`:`<button data-open-entry="${esc(entry.id)}">${esc(C.once)}</button>`;
    return `<div class="social-chain-entry ${state}"><span class="social-chain-entry-avatar">${esc(initials(entry.name))}</span><span class="social-chain-entry-copy"><b>${esc(entry.name)}</b><span>${esc(entry.caption || timeText(entry.created_at))}</span><span class="social-provenance">${esc(provenanceLabel(entry.provenance))}</span></span>${action}</div>`;
  }).join('');
  backdrop.innerHTML=`<div class="social-loop-sheet"><div class="social-loop-sheet-head"><div><span>${esc(data.mode==='collective'?C.collective:C.direct)}</span><h3>${esc(data.title||C.live)}</h3></div><button class="social-loop-close" data-close>×</button></div><div class="social-chain-members">${members}<small>${data.members?.length||0} ${esc(C.people)}</small></div><div class="social-chain-timeline">${entries||`<div class="social-loop-empty">${esc(C.emptyLume)}</div>`}</div>${data.active?`<div class="social-loop-actions"><button class="social-loop-primary" data-add-entry>＋ ${esc(C.add)}</button></div>`:''}</div>`;
  document.body.appendChild(backdrop);const close=()=>closeBackdrop(backdrop);backdrop.querySelector('[data-close]').onclick=close;backdrop.addEventListener('pointerdown',e=>{if(e.target===backdrop)close()});
  backdrop.querySelector('[data-add-entry]')?.addEventListener('click',()=>{close();openLumeComposer({chainId:id})});
  backdrop.querySelectorAll('[data-open-entry]').forEach(btn=>btn.onclick=async()=>{try{const opened=await request(`/one/viral/lume-entries/${encodeURIComponent(btn.dataset.openEntry)}/open`,{method:'POST'});close();showOnce(opened,()=>openLumeComposer({chainId:id,replyToId:opened.id}))}catch(error){notify(error.message);close();lumeLoading=false;renderLumes()}});
  backdrop.querySelector('[data-recap-now]')?.addEventListener('click',()=>{close();openRecap(id)});
}

function showOnce(entry,onReply) {
  const backdrop=document.createElement('div');backdrop.className='social-loop-backdrop';backdrop.innerHTML=`<div class="social-once-view"><img src="${esc(entry.media_url)}" alt="" style="${effectStyle(entry.effect)}"><div class="social-once-copy"><div><b>${esc(entry.caption||C.live)}</b><span class="social-provenance">${esc(provenanceLabel(entry.provenance))}</span></div><div class="social-loop-actions"><button class="social-loop-secondary" data-reply>${esc(C.reply)}</button><button class="social-loop-primary" data-close>${esc(C.close)}</button></div></div></div>`;document.body.appendChild(backdrop);
  const close=()=>{closeBackdrop(backdrop);lumeLoading=false;void renderLumes()};backdrop.querySelector('[data-close]').onclick=close;backdrop.querySelector('[data-reply]').onclick=()=>{closeBackdrop(backdrop);onReply?.()};
}

async function openRecap(id) {
  let data;try{data=await request(`/one/viral/lume-chains/${encodeURIComponent(id)}/recap`)}catch(error){return notify(error.message)}
  const entries=data.entries||[];if(!entries.length)return notify(C.emptyRecap);
  const backdrop=document.createElement('div');backdrop.className='social-loop-backdrop';const stage=document.createElement('div');stage.className='social-recap-stage';backdrop.appendChild(stage);document.body.appendChild(backdrop);let index=0,timer=null;
  const render=()=>{const item=entries[index];stage.innerHTML=`<div class="social-recap-progress">${entries.map((_,i)=>`<i class="${i<index?'is-done':i===index?'is-current':''}"></i>`).join('')}</div><button class="social-loop-close" data-close style="position:absolute;right:14px;top:25px;z-index:4">×</button><img src="${esc(item.media_url)}" alt="" style="${effectStyle(item.effect)}"><div class="social-recap-overlay"></div><div class="social-recap-copy"><span>${esc(C.recaps)} · ${index+1}/${entries.length}</span><h3>${esc(data.title||C.collective)}</h3><p>${esc(item.name)}${item.caption?` · ${esc(item.caption)}`:''} · ${esc(provenanceLabel(item.provenance))}</p></div>`;stage.querySelector('[data-close]').onclick=close;};
  const close=()=>{clearInterval(timer);backdrop.remove()};render();timer=setInterval(()=>{index=(index+1)%entries.length;render()},2200);backdrop.addEventListener('pointerdown',e=>{if(e.target===backdrop)close()});
}

// -------------------------------------------------------------------------
// Agora social
// -------------------------------------------------------------------------
const AGORA_TYPES=[['coffee','☕'],['food','🍽️'],['sport','⚽'],['walk','🚶'],['cinema','🎬'],['gaming','🎮'],['drinks','🥂'],['music','🎵'],['study','📚'],['custom','✦']];
let agoraMount=null,agoraBusy=false;
const agoraEmoji=kind=>AGORA_TYPES.find(x=>x[0]===kind)?.[1]||'✦';

function enhanceAgora(){const page=document.querySelector('.one-agora-page');if(!page||page.dataset.socialAgora==='1')return;page.dataset.socialAgora='1';page.classList.add('is-social-agora-ready');agoraMount=document.createElement('section');agoraMount.className='social-agora-mount';page.prepend(agoraMount);void renderAgora()}

async function renderAgora(){if(!agoraMount||agoraBusy)return;agoraBusy=true;agoraMount.innerHTML=`<div class="social-loop-panel"><div class="social-loop-inner"><div class="social-loop-kicker"><span class="dot"></span>${esc(C.agora)}</div><h2 class="social-loop-title">${esc(C.agoraHero.split('. ')[0])}. <i>${esc((C.agoraHero.split('. ')[1]||'').replace('.',''))}</i></h2><p class="social-loop-subtitle">${esc(C.agoraSub)}</p><div class="social-loop-actions"><button class="social-loop-primary" data-create-agora>＋ ${esc(C.createPlan)}</button></div><div class="social-agora-grid" data-agora-grid></div></div></div>`;agoraMount.querySelector('[data-create-agora]').onclick=openAgoraCreate;
  try{const items=await request('/one/viral/agora');const grid=agoraMount.querySelector('[data-agora-grid]');grid.innerHTML=items.length?items.map(item=>`<button class="social-agora-card${item.joined?' is-joined':''}" data-agora-id="${esc(item.id)}"><div class="social-agora-card-top"><span class="social-agora-emoji">${agoraEmoji(item.kind)}</span><span class="social-agora-live"></span></div><h4>${esc(item.title)}</h4><p>${esc(item.note||item.coarse_location||'')}</p><div class="social-agora-meta"><span>⌖ ${esc(item.coarse_location||'—')}</span><span>${item.member_count}/${item.capacity} · ${esc(item.joined?C.joined:C.join)}</span></div></button>`).join(''):`<div class="social-loop-empty" style="grid-column:1/-1">${esc(C.noAgora)}</div>`;grid.querySelectorAll('[data-agora-id]').forEach(btn=>btn.onclick=()=>openAgoraDetail(btn.dataset.agoraId))}catch(error){notify(error.message)}finally{agoraBusy=false}}

function openAgoraCreate(){const location=readCachedRadarLocation();const coarse=location?.city||location?.region||location?.label||'';const backdrop=document.createElement('div');backdrop.className='social-loop-backdrop';backdrop.innerHTML=`<div class="social-loop-sheet"><div class="social-loop-sheet-head"><div><span>${esc(C.agora)}</span><h3>${esc(C.plan)}</h3></div><button class="social-loop-close" data-close>×</button></div><div class="social-agora-types">${AGORA_TYPES.map(([key,emoji],i)=>`<button data-kind="${key}" class="${i===0?'is-on':''}"><b>${emoji}</b>${esc(key)}</button>`).join('')}</div><label class="social-loop-field">${esc(C.what)}<input data-title maxlength="100" placeholder="${esc(C.whatPh)}"></label><label class="social-loop-field">${esc(C.note)}<textarea data-note maxlength="300" placeholder="${esc(C.notePh)}"></textarea></label><label class="social-loop-field">${esc(C.approx)}<input data-coarse maxlength="100" value="${esc(coarse)}"></label><label class="social-loop-field">${esc(C.exact)}<input data-meeting maxlength="180" placeholder="${esc(C.exactPh)}"><small>${esc(C.exactHelp)}</small></label><label class="social-loop-field">${esc(C.when)}<input data-start type="datetime-local"></label><div style="display:grid;grid-template-columns:1fr 1fr;gap:9px"><label class="social-loop-field">${esc(C.duration)}<select data-hours><option value="2">2h</option><option value="4" selected>4h</option><option value="8">8h</option><option value="12">12h</option><option value="24">24h</option></select></label><label class="social-loop-field">${esc(C.capacity)}<input data-capacity type="number" min="2" max="30" value="8"></label></div><div class="social-agora-private"><b>◉</b><span>${esc(C.exactHelp)}</span></div><div class="social-loop-sheet-footer"><button class="social-loop-primary" data-submit>${esc(C.publish)}</button></div><div class="social-loop-error" data-error style="display:none"></div></div>`;document.body.appendChild(backdrop);let kind='coffee',busy=false;const close=()=>closeBackdrop(backdrop);backdrop.querySelector('[data-close]').onclick=close;backdrop.querySelectorAll('[data-kind]').forEach(btn=>btn.onclick=()=>{kind=btn.dataset.kind;backdrop.querySelectorAll('[data-kind]').forEach(x=>x.classList.toggle('is-on',x===btn))});backdrop.querySelector('[data-submit]').onclick=async()=>{if(busy)return;const title=backdrop.querySelector('[data-title]').value.trim();if(!title)return;busy=true;const button=backdrop.querySelector('[data-submit]');button.disabled=true;try{await request('/one/viral/agora',{method:'POST',body:{kind,title,note:backdrop.querySelector('[data-note]').value,coarseLocation:backdrop.querySelector('[data-coarse]').value,meetingPoint:backdrop.querySelector('[data-meeting]').value,startsAt:backdrop.querySelector('[data-start]').value||null,hours:Number(backdrop.querySelector('[data-hours]').value),capacity:Number(backdrop.querySelector('[data-capacity]').value)}});close();notify(C.planCreated);agoraBusy=false;renderAgora()}catch(error){const n=backdrop.querySelector('[data-error]');n.textContent=error.message;n.style.display='';button.disabled=false}finally{busy=false}}}

async function openAgoraDetail(id){let data;try{data=await request(`/one/viral/agora/${encodeURIComponent(id)}`)}catch(error){return notify(error.message)}const backdrop=document.createElement('div');backdrop.className='social-loop-backdrop';let poll=null;
  const build=async()=>{try{data=await request(`/one/viral/agora/${encodeURIComponent(id)}`)}catch{};let messages=[];if(data.joined){try{messages=await request(`/one/viral/agora/${encodeURIComponent(id)}/messages`)}catch{}}
    backdrop.innerHTML=`<div class="social-loop-sheet"><div class="social-loop-sheet-head"><div><span>${esc(C.agora)} · ${agoraEmoji(data.kind)}</span><h3>${esc(data.title)}</h3></div><button class="social-loop-close" data-close>×</button></div><div class="social-agora-detail-hero"><span>${esc(data.coarse_location||'')}</span><h3>${esc(data.title)}</h3><p>${esc(data.note||'')}</p></div><div class="social-agora-members">${(data.members||[]).map(m=>`<span class="social-agora-member"><span>${esc(initials(m.name))}</span>${esc(m.name.split(' ')[0])}</span>`).join('')}</div>${data.joined&&data.meeting_point?`<div class="social-agora-meeting"><small>${esc(C.privatePoint)}</small><b>${esc(data.meeting_point)}</b></div>`:''}${!data.joined?`<button class="social-loop-primary" style="width:100%" data-join>${esc(C.join)}</button>`:`<div class="social-agora-chat"><div class="social-agora-messages">${messages.map(m=>`<div class="social-agora-message${m.author_id===window.__luminaCurrentUserId?' is-mine':''}"><b>${esc(m.name||m.handle)}</b>${esc(m.body)}</div>`).join('')||`<div class="social-loop-empty">${esc(C.chat)}</div>`}</div><form class="social-agora-compose" data-chat><input maxlength="500" placeholder="${esc(C.message)}"><button>${esc(C.sendMsg)}</button></form></div><div class="social-loop-actions"><button class="social-loop-primary" data-agora-lume>✦ ${esc(C.collectiveLume)}</button>${data.mine?`<button class="social-loop-secondary" data-finish>${esc(C.finish)}</button>`:`<button class="social-loop-secondary" data-leave>${esc(C.leave)}</button>`}</div>`}</div>`;
    backdrop.querySelector('[data-close]').onclick=close;backdrop.querySelector('[data-join]')?.addEventListener('click',async()=>{try{await request(`/one/viral/agora/${encodeURIComponent(id)}/join`,{method:'POST'});notify(C.entered);await build();agoraBusy=false;renderAgora()}catch(error){notify(error.message)}});backdrop.querySelector('[data-chat]')?.addEventListener('submit',async e=>{e.preventDefault();const input=e.currentTarget.querySelector('input');const body=input.value.trim();if(!body)return;input.value='';try{await request(`/one/viral/agora/${encodeURIComponent(id)}/messages`,{method:'POST',body:{body}});await build()}catch(error){notify(error.message)}});backdrop.querySelector('[data-agora-lume]')?.addEventListener('click',async()=>{try{const result=await request(`/one/viral/agora/${encodeURIComponent(id)}/lume`,{method:'POST'});focusedChainId=result.chainId;close();switchToLumes();notify(C.sent)}catch(error){notify(error.message)}});backdrop.querySelector('[data-finish]')?.addEventListener('click',async()=>{try{await request(`/one/viral/agora/${encodeURIComponent(id)}`,{method:'DELETE'});close();agoraBusy=false;renderAgora()}catch(error){notify(error.message)}});backdrop.querySelector('[data-leave]')?.addEventListener('click',async()=>{try{await request(`/one/viral/agora/${encodeURIComponent(id)}/leave`,{method:'POST'});close();agoraBusy=false;renderAgora()}catch(error){notify(error.message)}});
  };
  const close=()=>{clearInterval(poll);closeBackdrop(backdrop)};document.body.appendChild(backdrop);backdrop.addEventListener('pointerdown',e=>{if(e.target===backdrop)close()});await build();if(data.joined)poll=setInterval(()=>{if(document.body.contains(backdrop))void build()},12000)}

function switchToLumes(){const button=[...document.querySelectorAll('.one-tabs button')].find(btn=>/lume/i.test(btn.textContent||''));button?.click();setTimeout(()=>{lumeLoading=false;void renderLumes()},250)}

// -------------------------------------------------------------------------
// Radar “Dos meus”
// -------------------------------------------------------------------------
function enhanceRadar(){const switcher=document.querySelector('.radar-split-switch.radar-three-way');if(!switcher)return;const shell=switcher.closest('.explore-shell');if(!shell)return;if(!switcher.querySelector('[data-radar-network]')){switcher.classList.add('has-network-scope');const button=document.createElement('button');button.type='button';button.className='radar-network-tab';button.dataset.radarNetwork='1';button.setAttribute('role','tab');button.setAttribute('aria-selected','false');button.innerHTML=`<span class="radar-network-mini">◉</span> ${esc(C.network)}`;switcher.appendChild(button);button.onclick=()=>{shell.classList.add('is-network-scope');switcher.querySelectorAll('button').forEach(b=>{b.classList.toggle('is-active',b===button);b.setAttribute('aria-selected',b===button?'true':'false')});void renderRadarNetwork(shell)};[...switcher.querySelectorAll('button')].filter(b=>b!==button).forEach(b=>{if(b.dataset.networkExit)return;b.dataset.networkExit='1';b.addEventListener('click',()=>{shell.classList.remove('is-network-scope');button.classList.remove('is-active');button.setAttribute('aria-selected','false')})})}
  if(!shell.querySelector('.social-radar-network-panel')){const panel=document.createElement('section');panel.className='social-radar-network-panel';switcher.insertAdjacentElement('afterend',panel)}wireRadarCards(shell)}

async function renderRadarNetwork(shell){const panel=shell.querySelector('.social-radar-network-panel');if(!panel)return;panel.innerHTML=`<div class="social-radar-network-intro"><span>${esc(C.networkKicker)}</span><h2>${esc(C.networkHero)}</h2><p>${esc(C.networkSub)}</p></div><div class="social-loop-empty">…</div>`;try{const result=await request('/one/viral/radar/friends');const items=result.items||[];panel.innerHTML=`<div class="social-radar-network-intro"><span>${esc(C.networkKicker)}</span><h2>${esc(C.networkHero)}</h2><p>${esc(C.networkSub)}</p></div><div class="social-radar-network-list">${items.length?items.map(item=>`<article class="social-radar-network-card">${item.image_url?`<img src="${esc(`${BASE}/radar-images/${item.id}`)}" alt="" loading="lazy" onerror="this.remove()">`:''}<div class="social-radar-network-body"><span class="social-radar-network-signal">◉ ${esc(C.networkCount(Number(item.network_count)||0))}</span><h3>${esc(item.title)}</h3><p>${esc(item.summary||item.body||'')}</p><div class="social-radar-network-foot"><span>${esc(item.source_name||'Radar')} · ${item.signal_count} sinais</span>${item.external_url?`<a href="${esc(item.external_url)}" target="_blank" rel="noopener noreferrer external">${esc(C.source)} ↗</a>`:''}</div></div></article>`).join(''):`<div class="social-loop-empty">${esc(C.networkEmpty)}</div>`}</div>`}catch(error){panel.innerHTML+=`<div class="social-loop-error">${esc(error.message)}</div>`}}

function wireRadarCards(shell=document){shell.querySelectorAll('.explore-card').forEach(card=>{if(card.dataset.socialSignals==='1')return;card.dataset.socialSignals='1';const footer=card.querySelector('.explore-card-footer');if(!footer)return;const title=card.querySelector('h2,h3')?.textContent?.trim()||'';const externalUrl=card.querySelector('.explore-external')?.href||'';const actions=document.createElement('div');actions.className='social-radar-actions';actions.innerHTML=`<button type="button" data-save>☆ ${esc(C.save)}</button><button type="button" data-share>↗ ${esc(C.share)}</button>`;footer.appendChild(actions);actions.querySelector('[data-save]').onclick=async e=>{e.stopPropagation();const btn=e.currentTarget;if(btn.classList.contains('is-done'))return;try{await request('/one/viral/radar/signal',{method:'POST',body:{kind:'save',externalUrl,title}});btn.classList.add('is-done');btn.textContent=`✓ ${C.saved}`;notify(C.signalSaved)}catch(error){notify(error.message)}};actions.querySelector('[data-share]').onclick=async e=>{e.stopPropagation();const shareUrl=externalUrl||window.location.href;try{if(navigator.share)await navigator.share({title,url:shareUrl});else await navigator.clipboard?.writeText(shareUrl);await request('/one/viral/radar/signal',{method:'POST',body:{kind:'share',externalUrl,title}});e.currentTarget.classList.add('is-done');notify(C.signalShared)}catch(error){if(error?.name!=='AbortError')notify(error.message)}}})}

// Track own id only for Agora bubble alignment; harmless if unavailable.
void request('/auth/me').then(me=>{window.__luminaCurrentUserId=me?.id||''}).catch(()=>{});

function boot(){enhanceLumes();enhanceAgora();enhanceRadar();wireRadarCards()}
const observer=new MutationObserver(()=>boot());
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{boot();observer.observe(document.body,{childList:true,subtree:true})},{once:true});else{boot();observer.observe(document.body,{childList:true,subtree:true})}
