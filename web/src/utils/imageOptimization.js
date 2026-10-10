/**
 * Privacy-aware on-device image pipeline. Uploaded objects remain compatible
 * with the existing JPEG/PNG/WebP signed-upload API and existing media URLs.
 */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const DEFAULT_MAX_DIMENSION = 2048;
const INPUT_TYPES = new Set(['image/jpeg','image/png','image/webp','image/avif','image/heic','image/heif']);
const SUFFIXES = { 'image/jpeg':'jpg','image/png':'png','image/webp':'webp' };
const TYPE_BY_EXTENSION = { jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',
  webp:'image/webp',avif:'image/avif',heic:'image/heic',heif:'image/heif' };

function mimeOf(blob) {
  const raw = String(blob.type || '').toLowerCase().split(';')[0].trim();
  if (raw === 'image/jpg') return 'image/jpeg';
  if (raw === 'image/x-png') return 'image/png';
  if (INPUT_TYPES.has(raw)) return raw;
  if (!raw && blob.name) {
    const ext = String(blob.name).split('.').pop().toLowerCase();
    return TYPE_BY_EXTENSION[ext] || '';
  }
  return raw;
}
function asFile(blob, source, mime) {
  const stem = String(source.name || 'fotografia').replace(/\.[^.]+$/,'')
    .normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-')
    .replace(/^[-.]+|[-.]+$/g,'').slice(0,70) || 'fotografia';
  return new File([blob], stem + '-lumina.' + SUFFIXES[mime],
    { type:mime, lastModified:Date.now() });
}
async function decode(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, {imageOrientation:'from-image'});
      return {source:bitmap,width:bitmap.width,height:bitmap.height,
        close:() => bitmap.close?.()};
    } catch { /* Safari WebViews can decode through Image even without ImageBitmap */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return {source:img,width:img.naturalWidth,height:img.naturalHeight,
      close:() => URL.revokeObjectURL(url)};
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('Não foi possível abrir esta fotografia. Exporta como JPEG ou PNG e tenta novamente.');
  }
}
async function encode(canvas,mime,quality) {
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,mime,quality));
  return blob && blob.type===mime && blob.size ? blob : null;
}
async function isAnimatedWebP(blob) {
  const data=new Uint8Array(await blob.slice(0,256*1024).arrayBuffer());
  const tag=at=>String.fromCharCode(...data.slice(at,at+4));
  if (data.length<20||tag(0)!=='RIFF'||tag(8)!=='WEBP') return false;
  for (let i=12;i+8<data.length;) {
    if (tag(i)==='ANIM'||tag(i)==='ANMF') return true;
    const n=data[i+4]+data[i+5]*256+data[i+6]*65536+data[i+7]*16777216;
    if (!Number.isFinite(n)||n<0) return false;
    i+=8+n+(n%2);
  }
  return false;
}
export async function optimizeUploadMedia(file,{maxDimension=DEFAULT_MAX_DIMENSION}={}) {
  if (!(file instanceof Blob)||file.size<=0) throw new Error('Escolhe uma fotografia ou vídeo válido.');
  const mime=mimeOf(file);
  if (mime.startsWith('video/')) return file;
  if (!INPUT_TYPES.has(mime)) {
    throw new Error('Formato não suportado. Utiliza JPEG, PNG, WebP, AVIF ou HEIC compatível.');
  }
  if (file.size>60*1024*1024) throw new Error('Fotografia original demasiado grande (máximo 60 MB).');
  if (mime==='image/webp' && await isAnimatedWebP(file)) {
    if (file.size>MAX_IMAGE_BYTES) throw new Error('WebP animado excede os 8 MB permitidos.');
    return file; // retain all frames instead of flattening the animation
  }
  const decoded=await decode(file);
  try {
    if (!decoded.width||!decoded.height||decoded.width*decoded.height>80_000_000) {
      throw new Error('Fotografia com dimensões inválidas ou demasiado grandes.');
    }
    const maximum=Math.min(4096,Math.max(640,Math.floor(Number(maxDimension)||DEFAULT_MAX_DIMENSION)));
    const scale=Math.min(1,maximum/Math.max(decoded.width,decoded.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(decoded.width*scale));
    canvas.height=Math.max(1,Math.round(decoded.height*scale));
    const ctx=canvas.getContext('2d',{alpha:true});
    if (!ctx) throw new Error('Conversão de imagens indisponível neste dispositivo.');
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality='high';
    ctx.drawImage(decoded.source,0,0,canvas.width,canvas.height);

    // Re-encoding static photos strips metadata (including embedded location).
    // PNG preserves text/graphics and transparency losslessly whenever possible.
    if (mime==='image/png') {
      const png=await encode(canvas,'image/png');
      if (png && png.size<=MAX_IMAGE_BYTES) return asFile(png,file,'image/png');
      for (const quality of [0.88,0.76,0.62]) {
        const webp=await encode(canvas,'image/webp',quality);
        if (webp && webp.size<=MAX_IMAGE_BYTES) return asFile(webp,file,'image/webp');
      }
      throw new Error('Esta imagem continua demasiado grande após otimização.');
    }
    // Prefer WebP if it saves at least 7% against JPEG; Safari falls back to
    // JPEG when its Canvas encoder does not support WebP.
    for (const quality of [0.88,0.76,0.62]) {
      const [webp,jpeg]=await Promise.all([
        encode(canvas,'image/webp',quality),
        encode(canvas,'image/jpeg',Math.min(.94,quality+.04)),
      ]);
      const selection=webp && webp.size<=(jpeg?.size??Infinity)*.93
        ? {blob:webp,mime:'image/webp'}
        : jpeg ? {blob:jpeg,mime:'image/jpeg'}
          : webp ? {blob:webp,mime:'image/webp'} : null;
      if (selection?.blob.size<=MAX_IMAGE_BYTES) {
        return asFile(selection.blob,file,selection.mime);
      }
    }
    throw new Error('Não foi possível reduzir a fotografia ao limite de 8 MB.');
  } finally {
    decoded.close();
  }
}
