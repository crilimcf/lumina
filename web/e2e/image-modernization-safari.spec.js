import { test, expect } from '@playwright/test';

test('fotografias grandes são otimizadas e limitadas a 2048px', async ({page}) => {
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {optimizeUploadMedia}=await import('/src/utils/imageOptimization.js');
    const canvas=document.createElement('canvas');
    canvas.width=3100;canvas.height=2100;
    const ctx=canvas.getContext('2d');
    const grad=ctx.createLinearGradient(0,0,3100,2100);
    grad.addColorStop(0,'#1a2471');grad.addColorStop(1,'#f1b4e0');
    ctx.fillStyle=grad;ctx.fillRect(0,0,3100,2100);
    const original=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.95));
    const output=await optimizeUploadMedia(new File([original],'foto-iphone.jpg',{type:'image/jpeg'}));
    const image=new Image(); const url=URL.createObjectURL(output);
    try {
      image.src=url;await image.decode();
      return {mime:output.type,name:output.name,size:output.size,w:image.naturalWidth,h:image.naturalHeight};
    } finally {URL.revokeObjectURL(url);}
  });
  expect(['image/jpeg','image/webp']).toContain(result.mime);
  expect(result.name).toMatch(/\.(jpg|webp)$/);
  expect(Math.max(result.w,result.h)).toBeLessThanOrEqual(2048);
  expect(result.size).toBeGreaterThan(0);
  expect(result.size).toBeLessThanOrEqual(8*1024*1024);
});

test('PNG transparente conserva o alfa e não vira JPEG',async({page})=>{
  await page.goto('/');
  const output=await page.evaluate(async()=>{
    const {optimizeUploadMedia}=await import('/src/utils/imageOptimization.js');
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=220;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#ab41e1';ctx.fillRect(20,20,150,150);
    const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const normalized=await optimizeUploadMedia(new File([png],'logotipo.png',{type:'image/png'}));
    const bmp=await createImageBitmap(normalized);
    const out=document.createElement('canvas');out.width=bmp.width;out.height=bmp.height;
    const dest=out.getContext('2d');dest.drawImage(bmp,0,0);
    const alpha=dest.getImageData(0,0,1,1).data[3];
    bmp.close?.();return {mime:normalized.type,alpha,size:normalized.size};
  });
  expect(output.mime).toBe('image/png');
  expect(output.alpha).toBe(0);
  expect(output.size).toBeGreaterThan(0);
});

test('vídeo fica intacto e SVG não chega ao upload',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {optimizeUploadMedia}=await import('/src/utils/imageOptimization.js');
    let blocked=false;
    try{await optimizeUploadMedia(new File(['<svg/>'],'inline.svg',{type:'image/svg+xml'}));}
    catch{blocked=true;}
    const file=new File(['video-bytes'],'filme.mp4',{type:'video/mp4'});
    return {blocked,preserved:(await optimizeUploadMedia(file))===file};
  });
  expect(result).toEqual({blocked:true,preserved:true});
});

test('assinatura e bytes enviados pertencem ao ficheiro otimizado',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {api}=await import('/src/api.js');
    const previous=window.fetch;
    const observed={};
    window.fetch=async(input,init={})=>{
      const url=String(typeof input==='string'?input:input.url);
      if(url.includes('/uploads/sign')){
        observed.signed=JSON.parse(init.body);
        return new Response(JSON.stringify({uploadUrl:'/test-image-upload',key:'test-image'}),{
          status:200,headers:{'content-type':'application/json'},
        });
      }
      if(url.includes('/test-image-upload')){
        observed.putType=init.headers['content-type'];
        observed.putSize=init.body.size;
        return new Response('',{status:200});
      }
      if(url.includes('/uploads/confirm')){
        return new Response(JSON.stringify({url:'https://media.example.test/test-image.webp'}),{
          status:200,headers:{'content-type':'application/json'},
        });
      }
      return previous(input,init);
    };
    try{
      const canvas=document.createElement('canvas');canvas.width=2200;canvas.height=1200;
      canvas.getContext('2d').fillRect(0,0,2200,1200);
      const jpeg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));
      observed.url=await api.upload(new File([jpeg],'camera.jpg',{type:'image/jpeg'}));
      return observed;
    }finally{window.fetch=previous;}
  });
  expect(['image/jpeg','image/webp']).toContain(result.signed.mime);
  expect(result.putType).toBe(result.signed.mime);
  expect(result.putSize).toBe(result.signed.bytes);
  expect(result.url).toContain('/test-image.webp');
});
