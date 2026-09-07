import { api } from './api.js';
import { isNativeApp, nativeApiOrigin, nativeAuthHeaders } from './native/session.js';

const BASE = isNativeApp ? nativeApiOrigin : (import.meta.env.VITE_API_URL || '/api');
const SAFE = new Set(['GET','HEAD']);
let csrfToken = '';

const language = (() => {
  const code = String(navigator.language || 'pt-PT').toLowerCase().split('-')[0];
  return ['pt','fr','es','en'].includes(code) ? code : 'en';
})();

const COPY = {
  pt:{ ai:'IA', studio:'Estúdio IA', studioSub:'Cria ou edita uma imagem e acende um Lume com proveniência clara.', generate:'Gerar', edit:'Editar foto', prompt:'O que queres criar?', promptEdit:'O que queres alterar?', promptPh:'Ex.: uma noite de verão no Porto, fotografia natural', editPh:'Ex.: remover o fundo e manter um aspeto natural', choosePhoto:'Escolher fotografia', choosePeople:'Escolhe com quem', direct:'Direto', collective:'Coletivo', lumeName:'Nome do Lume', caption:'Legenda', improve:'Melhorar com IA', create:'Criar imagem', creating:'A criar…', publish:'Acender Lume', publishing:'A publicar…', generated:'Gerado com IA', edited:'Editado com IA', noFriends:'Precisas de pelo menos um amigo mútuo para criar este Lume.', needPeople:'Escolhe pelo menos uma pessoa.', needPrompt:'Escreve primeiro o que queres criar ou editar.', needPhoto:'Escolhe primeiro uma fotografia.', ready:'Imagem pronta', done:'Lume com IA aceso ✦', search:'Pesquisa IA', searchPh:'Procura por significado na tua Lumina…', all:'Tudo', social:'Feed', radar:'Radar', messages:'Conversas', find:'Procurar', searching:'A procurar…', empty:'Sem resultados relevantes.', privacy:'A pesquisa só corre quando a pedes e respeita o que podes ver.', close:'Fechar' },
  fr:{ ai:'IA', studio:'Studio IA', studioSub:'Crée ou modifie une image et allume un Lume avec une provenance claire.', generate:'Générer', edit:'Modifier photo', prompt:'Que veux-tu créer ?', promptEdit:'Que veux-tu modifier ?', promptPh:'Ex. une soirée d’été à Porto, photo naturelle', editPh:'Ex. enlever le fond en gardant un rendu naturel', choosePhoto:'Choisir une photo', choosePeople:'Choisis avec qui', direct:'Direct', collective:'Collectif', lumeName:'Nom du Lume', caption:'Légende', improve:'Améliorer avec IA', create:'Créer l’image', creating:'Création…', publish:'Allumer le Lume', publishing:'Publication…', generated:'Généré avec IA', edited:'Modifié avec IA', noFriends:'Il faut au moins un ami mutuel.', needPeople:'Choisis au moins une personne.', needPrompt:'Décris d’abord ce que tu veux créer ou modifier.', needPhoto:'Choisis d’abord une photo.', ready:'Image prête', done:'Lume IA allumé ✦', search:'Recherche IA', searchPh:'Recherche par sens dans ta Lumina…', all:'Tout', social:'Feed', radar:'Radar', messages:'Conversations', find:'Rechercher', searching:'Recherche…', empty:'Aucun résultat pertinent.', privacy:'La recherche ne se lance que lorsque tu la demandes et respecte ce que tu peux voir.', close:'Fermer' },
  es:{ ai:'IA', studio:'Estudio IA', studioSub:'Crea o edita una imagen y enciende un Lume con procedencia clara.', generate:'Generar', edit:'Editar foto', prompt:'¿Qué quieres crear?', promptEdit:'¿Qué quieres cambiar?', promptPh:'Ej.: una noche de verano en Oporto, foto natural', editPh:'Ej.: quitar el fondo manteniendo un aspecto natural', choosePhoto:'Elegir fotografía', choosePeople:'Elige con quién', direct:'Directo', collective:'Colectivo', lumeName:'Nombre del Lume', caption:'Texto', improve:'Mejorar con IA', create:'Crear imagen', creating:'Creando…', publish:'Encender Lume', publishing:'Publicando…', generated:'Generado con IA', edited:'Editado con IA', noFriends:'Necesitas al menos un amigo mutuo.', needPeople:'Elige al menos una persona.', needPrompt:'Describe primero lo que quieres crear o editar.', needPhoto:'Elige primero una fotografía.', ready:'Imagen lista', done:'Lume con IA encendido ✦', search:'Búsqueda IA', searchPh:'Busca por significado en tu Lumina…', all:'Todo', social:'Feed', radar:'Radar', messages:'Conversaciones', find:'Buscar', searching:'Buscando…', empty:'Sin resultados relevantes.', privacy:'La búsqueda solo se ejecuta cuando la pides y respeta lo que puedes ver.', close:'Cerrar' },
  en:{ ai:'AI', studio:'AI Studio', studioSub:'Create or edit an image and light a Lume with clear provenance.', generate:'Generate', edit:'Edit photo', prompt:'What do you want to create?', promptEdit:'What do you want to change?', promptPh:'E.g. a summer evening in Porto, natural photo', editPh:'E.g. remove the background and keep it natural', choosePhoto:'Choose photo', choosePeople:'Choose who', direct:'Direct', collective:'Collective', lumeName:'Lume name', caption:'Caption', improve:'Improve with AI', create:'Create image', creating:'Creating…', publish:'Light Lume', publishing:'Publishing…', generated:'Generated with AI', edited:'Edited with AI', noFriends:'You need at least one mutual friend.', needPeople:'Choose at least one person.', needPrompt:'Describe what you want to create or edit first.', needPhoto:'Choose a photo first.', ready:'Image ready', done:'AI Lume lit ✦', search:'AI search', searchPh:'Search your Lumina by meaning…', all:'All', social:'Feed', radar:'Radar', messages:'Conversations', find:'Search', searching:'Searching…', empty:'No relevant results.', privacy:'Search only runs when you ask and respects what you can see.', close:'Close' },
};
const C = COPY[language];
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char=>({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));

function toast(text) {
  let node = document.querySelector('.ai-toast');
  if (!node) { node=document.createElement('div');node.className='ai-toast';document.body.appendChild(node); }
  node.textContent=text;node.classList.add('is-on');clearTimeout(node._timer);node._timer=setTimeout(()=>node.classList.remove('is-on'),2800);
}

async function ensureCsrf() {
  if (isNativeApp || csrfToken) return csrfToken;
  const response = await fetch(`${BASE}/auth/me`, { credentials:'include', headers:nativeAuthHeaders() });
  if (!response.ok) throw new Error('Sessão expirada');
  const data = await response.json();
  csrfToken = data.csrf || '';
  return csrfToken;
}

async function request(path, { method='GET', body } = {}) {
  if (!SAFE.has(method)) await ensureCsrf();
  const headers={ ...nativeAuthHeaders() };
  if (body !== undefined) headers['content-type']='application/json';
  if (!SAFE.has(method) && csrfToken) headers['x-csrf-token']=csrfToken;
  const response=await fetch(`${BASE}${path}`, { method,headers,credentials:'include',body:body===undefined?undefined:JSON.stringify(body) });
  const data=await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || 'Lumina');
  return data;
}

function closeModal(backdrop) { backdrop?.remove(); }

async function openAiStudio() {
  let friends=[];
  try {
    await api.auth.me();
    const status=await api.ai.status();
    if (!status.configured) throw new Error('A IA ainda não está ligada no servidor.');
    friends=await request('/one/viral/lume-friends');
  } catch (error) { return toast(error.message); }
  if (!friends.length) return toast(C.noFriends);

  const backdrop=document.createElement('div');
  backdrop.className='ai-backdrop';
  const friendHtml=friends.map(friend=>`<label class="ai-friend"><input type="checkbox" value="${esc(friend.id)}"><span>${esc((friend.name||friend.handle||'?').slice(0,1).toUpperCase())}</span><b>${esc(friend.name||friend.handle)}</b></label>`).join('');
  backdrop.innerHTML=`<section class="ai-sheet" role="dialog" aria-modal="true" aria-label="${esc(C.studio)}"><header><div><small>✦ ${esc(C.ai)}</small><h2>${esc(C.studio)}</h2><p>${esc(C.studioSub)}</p></div><button data-close aria-label="${esc(C.close)}">×</button></header><div class="ai-tabs"><button data-tool="generate" class="is-on">✦ ${esc(C.generate)}</button><button data-tool="edit">◫ ${esc(C.edit)}</button></div><div class="ai-modes"><button data-mode="direct" class="is-on">↗ ${esc(C.direct)}</button><button data-mode="collective">✦ ${esc(C.collective)}</button></div><label class="ai-field ai-title-field" hidden>${esc(C.lumeName)}<input data-title maxlength="80"></label><label class="ai-field"><span data-prompt-label>${esc(C.prompt)}</span><textarea data-prompt maxlength="800" placeholder="${esc(C.promptPh)}"></textarea></label><label class="ai-field ai-source-field" hidden>${esc(C.choosePhoto)}<input data-source type="file" accept="image/jpeg,image/png,image/webp"></label><div class="ai-people"><b>${esc(C.choosePeople)}</b><div>${friendHtml}</div></div><label class="ai-field">${esc(C.caption)}<div class="ai-caption-row"><input data-caption maxlength="180"><button type="button" data-rewrite>✦ ${esc(C.improve)}</button></div></label><div class="ai-preview" data-preview><span>✦</span><p>${esc(C.prompt)}</p></div><div class="ai-error" data-error hidden></div><footer><button class="ai-secondary" data-create>✦ ${esc(C.create)}</button><button class="ai-primary" data-publish disabled>${esc(C.publish)}</button></footer></section>`;
  document.body.appendChild(backdrop);

  let tool='generate',mode='direct',result=null,busy=false;
  const prompt=backdrop.querySelector('[data-prompt]');
  const preview=backdrop.querySelector('[data-preview]');
  const errorNode=backdrop.querySelector('[data-error]');
  const publish=backdrop.querySelector('[data-publish]');
  const create=backdrop.querySelector('[data-create]');
  const showError=text=>{errorNode.textContent=text;errorNode.hidden=false};
  const clearError=()=>{errorNode.hidden=true;errorNode.textContent=''};
  const close=()=>closeModal(backdrop);
  backdrop.querySelector('[data-close]').onclick=close;
  backdrop.addEventListener('pointerdown',event=>{if(event.target===backdrop)close()});

  backdrop.querySelectorAll('[data-tool]').forEach(button=>button.onclick=()=>{
    tool=button.dataset.tool;result=null;publish.disabled=true;clearError();
    backdrop.querySelectorAll('[data-tool]').forEach(x=>x.classList.toggle('is-on',x===button));
    backdrop.querySelector('.ai-source-field').hidden=tool!=='edit';
    backdrop.querySelector('[data-prompt-label]').textContent=tool==='edit'?C.promptEdit:C.prompt;
    prompt.placeholder=tool==='edit'?C.editPh:C.promptPh;
    preview.innerHTML=`<span>✦</span><p>${esc(tool==='edit'?C.promptEdit:C.prompt)}</p>`;
  });
  backdrop.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{
    mode=button.dataset.mode;backdrop.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('is-on',x===button));
    backdrop.querySelector('.ai-title-field').hidden=mode!=='collective';
  });

  backdrop.querySelector('[data-rewrite]').onclick=async()=>{
    const input=backdrop.querySelector('[data-caption]');
    if (!input.value.trim() || busy) return;
    const button=backdrop.querySelector('[data-rewrite]');button.disabled=true;
    try { const rewritten=await api.ai.rewrite(input.value,'caption',navigator.language||'pt-PT');input.value=rewritten.text||input.value; }
    catch(error){showError(error.message)} finally{button.disabled=false}
  };

  create.onclick=async()=>{
    if (busy) return;clearError();
    const instruction=prompt.value.trim();
    if (!instruction) return showError(C.needPrompt);
    const sourceFile=backdrop.querySelector('[data-source]').files?.[0];
    if (tool==='edit'&&!sourceFile) return showError(C.needPhoto);
    busy=true;create.disabled=true;create.textContent=C.creating;publish.disabled=true;
    try {
      if (tool==='generate') result=await api.ai.generateImage(instruction);
      else {
        const sourceUrl=await api.upload(sourceFile);
        result=await api.ai.editImage(sourceUrl,instruction);
      }
      preview.innerHTML=`<img src="${esc(result.url)}" alt=""><span class="ai-provenance">✦ ${esc(result.provenance==='edited_ai'?C.edited:C.generated)}</span>`;
      publish.disabled=false;
    } catch(error){showError(error.message)}
    finally{busy=false;create.disabled=false;create.textContent=C.create}
  };

  publish.onclick=async()=>{
    if (!result||busy) return;clearError();
    const recipientIds=[...backdrop.querySelectorAll('.ai-friend input:checked')].map(input=>input.value);
    if (!recipientIds.length) return showError(C.needPeople);
    busy=true;publish.disabled=true;publish.textContent=C.publishing;
    try {
      await request('/one/viral/lume-chains',{method:'POST',body:{
        mode,
        title:backdrop.querySelector('[data-title]').value.trim(),
        recipientIds,
        mediaUrl:result.url,
        effect:'normal',
        caption:backdrop.querySelector('[data-caption]').value.trim(),
        provenance:result.provenance,
      }});
      close();toast(C.done);setTimeout(()=>document.querySelector('[data-refresh-lumes]')?.click(),100);
    } catch(error){showError(error.message);publish.disabled=false;publish.textContent=C.publish}
    finally{busy=false}
  };
}

function enhanceLumeAi() {
  const host=document.querySelector('.social-lume2-hero .social-loop-actions');
  if (!host||host.querySelector('[data-ai-studio]')) return;
  const button=document.createElement('button');
  button.type='button';button.className='social-loop-secondary ai-studio-launch';button.dataset.aiStudio='1';button.innerHTML=`✦ ${esc(C.studio)}`;button.onclick=openAiStudio;host.appendChild(button);
}

function resultIcon(type) { return type==='radar'?'◉':type==='post'?'▦':type==='message'?'◌':'⌂'; }

function enhanceRadarSearch() {
  const switcher=document.querySelector('.radar-split-switch.radar-three-way');
  const shell=switcher?.closest('.explore-shell');
  if (!switcher||!shell||shell.querySelector('.ai-radar-search')) return;
  const panel=document.createElement('section');panel.className='ai-radar-search';
  panel.innerHTML=`<form data-ai-search><div class="ai-search-title"><span>✦</span><div><b>${esc(C.search)}</b><small>${esc(C.privacy)}</small></div></div><div class="ai-search-row"><input data-query maxlength="300" placeholder="${esc(C.searchPh)}"><select data-scope><option value="all">${esc(C.all)}</option><option value="social">${esc(C.social)}</option><option value="radar">${esc(C.radar)}</option><option value="messages">${esc(C.messages)}</option></select><button>${esc(C.find)}</button></div></form><div class="ai-search-results" data-results hidden></div>`;
  switcher.insertAdjacentElement('beforebegin',panel);
  const form=panel.querySelector('[data-ai-search]');const results=panel.querySelector('[data-results]');
  form.onsubmit=async event=>{
    event.preventDefault();const query=panel.querySelector('[data-query]').value.trim();if(query.length<2)return;
    const button=form.querySelector('button');button.disabled=true;button.textContent=C.searching;results.hidden=false;results.innerHTML='<div class="ai-search-loading">✦</div>';
    try {
      const data=await api.ai.search(query,panel.querySelector('[data-scope]').value);
      const items=data.results||[];
      results.innerHTML=items.length?items.map(item=>`${item.externalUrl?`<a class="ai-search-card" href="${esc(item.externalUrl)}" target="_blank" rel="noopener noreferrer external">`:'<article class="ai-search-card">'}<span>${resultIcon(item.type)}</span><div><b>${esc(item.label||item.type)}</b><p>${esc(item.snippet)}</p></div>${item.externalUrl?'<i>↗</i>':''}${item.externalUrl?'</a>':'</article>'}`).join(''):`<div class="ai-search-empty">${esc(C.empty)}</div>`;
    } catch(error){results.innerHTML=`<div class="ai-search-empty">${esc(error.message)}</div>`}
    finally{button.disabled=false;button.textContent=C.find}
  };
}

function boot(){enhanceLumeAi();enhanceRadarSearch()}
const observer=new MutationObserver(boot);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{boot();observer.observe(document.body,{childList:true,subtree:true})},{once:true});else{boot();observer.observe(document.body,{childList:true,subtree:true})}
