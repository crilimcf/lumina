import { t } from './i18n.js';

let activeViewer = null;
let previousBodyOverflow = '';

function messagePhotoCanBeSaved(image) {
  const wrap = image.closest('.message-wrap');
  if (!wrap) return false;

  // A received "view once" photo is temporarily rendered as a normal image only
  // after it has been opened. Its stamp has an extra countdown span. Do not
  // intercept those photos: the native ephemeral flow must keep control and must
  // never expose a save action.
  if (wrap.classList.contains('message-wrap-theirs')) {
    const stamp = wrap.querySelector('.message-stamp');
    const spans = stamp ? [...stamp.children].filter(node => node.tagName === 'SPAN') : [];
    if (spans.length > 1) return false;
  }

  return true;
}

function imageFileName(src, mime = '') {
  const extension = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const tail = (() => {
    try {
      const path = new URL(src, window.location.href).pathname.split('/').pop() || '';
      const clean = path.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 70);
      return clean && /\.(jpe?g|png|webp)$/i.test(clean) ? clean : null;
    } catch { return null; }
  })();
  return tail || `lumina-photo-${Date.now()}.${extension}`;
}

async function prepareFile(src) {
  const response = await fetch(src, { cache:'force-cache', credentials:'omit' });
  if (!response.ok) throw new Error(`photo ${response.status}`);
  const blob = await response.blob();
  if (!String(blob.type || '').startsWith('image/')) throw new Error('not-image');
  return new File([blob], imageFileName(src, blob.type), { type:blob.type || 'image/jpeg' });
}

function fallbackDownload(src, file) {
  const anchor = document.createElement('a');
  let objectUrl = null;

  if (file) {
    objectUrl = URL.createObjectURL(file);
    anchor.href = objectUrl;
    anchor.download = file.name;
  } else {
    // Cross-origin storage without GET CORS: opening the original image is the
    // safest fallback on iOS and still lets Safari offer its native save action.
    anchor.href = src;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.download = imageFileName(src);
  }

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
}

function closeViewer() {
  if (!activeViewer) return;
  activeViewer.remove();
  activeViewer = null;
  document.body.style.overflow = previousBodyOverflow;
}

function openViewer(sourceImage) {
  closeViewer();
  const src = sourceImage.currentSrc || sourceImage.src;
  if (!src) return;

  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  const overlay = document.createElement('div');
  overlay.dataset.luminaPhotoViewer = 'true';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', sourceImage.alt || 'Lumina');
  Object.assign(overlay.style, {
    position:'fixed', inset:'0', zIndex:'320', background:'rgba(4,5,12,.985)', color:'#fff',
    display:'grid', gridTemplateRows:'auto minmax(0,1fr)', overflow:'hidden',
    paddingTop:'env(safe-area-inset-top)', paddingBottom:'env(safe-area-inset-bottom)',
  });

  const toolbar = document.createElement('div');
  Object.assign(toolbar.style, {
    minHeight:'64px', padding:'10px max(12px, env(safe-area-inset-right)) 10px max(12px, env(safe-area-inset-left))',
    display:'flex', alignItems:'center', justifyContent:'flex-end', gap:'9px', flexShrink:'0',
  });

  const save = document.createElement('button');
  save.type = 'button';
  save.setAttribute('aria-label', t('Guardar'));
  Object.assign(save.style, {
    minHeight:'44px', minWidth:'108px', border:'0', borderRadius:'999px', padding:'0 15px',
    background:'rgba(255,255,255,.14)', color:'#fff', display:'inline-flex', alignItems:'center',
    justifyContent:'center', gap:'8px', font:'800 13px Manrope,system-ui,sans-serif',
  });
  save.textContent = `↓  ${t('Guardar')}`;
  save.disabled = true;
  save.style.opacity = '.62';

  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', t('Fechar'));
  Object.assign(close.style, {
    width:'44px', height:'44px', borderRadius:'999px', border:'0', background:'rgba(255,255,255,.14)',
    color:'#fff', display:'grid', placeItems:'center', font:'700 25px/1 system-ui,sans-serif',
  });
  close.textContent = '×';

  const stage = document.createElement('div');
  Object.assign(stage.style, {
    minHeight:'0', overflow:'auto', display:'grid', placeItems:'center', padding:'4px 10px 14px',
    WebkitOverflowScrolling:'touch', touchAction:'pinch-zoom',
  });

  const image = document.createElement('img');
  image.src = src;
  image.alt = sourceImage.alt || 'Lumina';
  image.draggable = false;
  Object.assign(image.style, {
    display:'block', maxWidth:'100%', maxHeight:'100%', width:'auto', height:'auto', objectFit:'contain',
    touchAction:'pinch-zoom', userSelect:'none', WebkitUserSelect:'none',
  });

  let preparedFile = null;
  let preparingDone = false;
  prepareFile(src)
    .then(file => { preparedFile = file; })
    .catch(() => { preparedFile = null; })
    .finally(() => {
      preparingDone = true;
      if (activeViewer === overlay) {
        save.disabled = false;
        save.style.opacity = '1';
      }
    });

  save.addEventListener('click', async event => {
    event.stopPropagation();
    if (!preparingDone) return;

    if (preparedFile && typeof navigator.share === 'function') {
      const payload = { files:[preparedFile], title:'Lumina' };
      const canShare = typeof navigator.canShare !== 'function' || navigator.canShare(payload);
      if (canShare) {
        try {
          await navigator.share(payload);
          return;
        } catch (error) {
          if (error?.name === 'AbortError') return;
        }
      }
    }

    fallbackDownload(src, preparedFile);
  });

  close.addEventListener('click', event => { event.stopPropagation(); closeViewer(); });
  toolbar.addEventListener('click', event => event.stopPropagation());
  stage.addEventListener('click', event => event.stopPropagation());
  overlay.addEventListener('click', closeViewer);

  toolbar.append(save, close);
  stage.appendChild(image);
  overlay.append(toolbar, stage);
  document.body.appendChild(overlay);
  activeViewer = overlay;
}

document.addEventListener('click', event => {
  const image = event.target?.closest?.('img.message-media');
  if (!image || !image.closest('button') || !messagePhotoCanBeSaved(image)) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  openViewer(image);
}, true);

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && activeViewer) closeViewer();
});
