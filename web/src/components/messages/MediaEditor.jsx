import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';

const ASPECTS = {
  original: null,
  square: 1,
  portrait: 4 / 5,
  landscape: 16 / 9,
};

function drawImage(canvas, image, { zoom, rotation, aspect }) {
  if (!canvas || !image) return;
  const rotated = rotation % 180 !== 0;
  const naturalW = rotated ? image.naturalHeight : image.naturalWidth;
  const naturalH = rotated ? image.naturalWidth : image.naturalHeight;
  const ratio = ASPECTS[aspect] || naturalW / naturalH;
  const maxSide = 1440;
  let width = maxSide;
  let height = Math.round(width / ratio);
  if (height > maxSide) {
    height = maxSide;
    width = Math.round(height * ratio);
  }
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(rotation * Math.PI / 180);
  const baseScale = Math.max(width / naturalW, height / naturalH) * zoom;
  const drawW = image.naturalWidth * baseScale;
  const drawH = image.naturalHeight * baseScale;
  ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

export function MediaEditor({ file, onCancel, onReady }) {
  const isVideo = file?.type?.startsWith('video/');
  const [image, setImage] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [aspect, setAspect] = useState('original');
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef(null);
  const url = useMemo(() => file ? URL.createObjectURL(file) : '', [file]);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => {
    if (!file || isVideo) return;
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = url;
  }, [file, isVideo, url]);
  useEffect(() => { if (image) drawImage(canvasRef.current, image, { zoom, rotation, aspect }); }, [image, zoom, rotation, aspect]);

  if (!file) return null;

  const confirm = async () => {
    if (isVideo) return onReady(file, 'video');
    if (!canvasRef.current) return;
    setBusy(true);
    try {
      const blob = await new Promise((resolve, reject) => canvasRef.current.toBlob(
        value => value ? resolve(value) : reject(new Error('Não foi possível preparar a imagem.')),
        'image/jpeg',
        0.9,
      ));
      const name = `${(file.name || 'imagem').replace(/\.[^.]+$/, '')}-lumina.jpg`;
      onReady(new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() }), 'image');
    } finally { setBusy(false); }
  };

  return <div role="dialog" aria-label="Pré-visualizar media" style={{ position:'fixed', inset:0, zIndex:210, background:'#080711', color:'#fff', display:'flex', flexDirection:'column' }}>
    <div style={{ padding:'calc(12px + env(safe-area-inset-top)) 14px 12px', display:'flex', alignItems:'center', gap:10 }}>
      <button onClick={onCancel} aria-label="Cancelar" style={{ width:42,height:42,borderRadius:99,border:0,background:'rgba(255,255,255,.12)',color:'#fff',display:'grid',placeItems:'center' }}><X size={20}/></button>
      <div style={{ flex:1, fontWeight:700 }}>Pré-visualização</div>
      <button onClick={confirm} disabled={busy || (!isVideo && !image)} style={{ border:0,borderRadius:99,padding:'10px 14px',background:'#fff',color:'#14122A',fontWeight:700,display:'flex',gap:7,alignItems:'center' }}><Check size={17}/>{busy?'A preparar…':'Usar'}</button>
    </div>
    <div style={{ flex:1, minHeight:0, display:'grid', placeItems:'center', padding:14, overflow:'auto' }}>
      {isVideo ? <video src={url} controls playsInline style={{ width:'100%', maxHeight:'68dvh', borderRadius:18, background:'#000' }} />
        : <canvas ref={canvasRef} style={{ width:'100%', maxWidth:520, maxHeight:'64dvh', objectFit:'contain', borderRadius:18, background:'#111' }} />}
    </div>
    {!isVideo && <div style={{ padding:'12px 16px calc(18px + env(safe-area-inset-bottom))', display:'grid', gap:12, background:'rgba(255,255,255,.05)' }}>
      <div style={{ display:'flex', gap:7, overflowX:'auto' }}>
        {[['original','Original'],['square','1:1'],['portrait','4:5'],['landscape','16:9']].map(([key,label]) => <button key={key} onClick={()=>setAspect(key)} style={{ flexShrink:0,border:'1px solid rgba(255,255,255,.18)',borderRadius:99,padding:'8px 12px',background:aspect===key?'#fff':'transparent',color:aspect===key?'#14122A':'#fff' }}>{label}</button>)}
        <button onClick={()=>setRotation(v=>(v+90)%360)} style={{ marginLeft:'auto',border:'1px solid rgba(255,255,255,.18)',borderRadius:99,padding:'8px 12px',background:'transparent',color:'#fff',display:'flex',gap:6,alignItems:'center' }}><RotateCcw size={15}/> Rodar</button>
      </div>
      <label style={{ display:'grid', gridTemplateColumns:'auto 1fr auto', gap:10, alignItems:'center', fontSize:13 }}><span>Recorte</span><input aria-label="Zoom do recorte" type="range" min="1" max="2.5" step="0.05" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/><span>{zoom.toFixed(1)}×</span></label>
      <div style={{ fontSize:12, opacity:.68 }}>A imagem é recortada ao centro. Podes escolher o formato, aproximar e rodar antes de enviar.</div>
    </div>}
    {isVideo && <div style={{ padding:'12px 16px calc(18px + env(safe-area-inset-bottom))', fontSize:12, opacity:.72 }}>Confirma o vídeo antes do envio. O recorte é aplicado apenas a fotografias.</div>}
  </div>;
}
