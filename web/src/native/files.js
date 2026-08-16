import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNativeApp } from './session.js';

const blobToBase64 = blob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error || new Error('Falha ao ler ficheiro'));
  reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
  reader.readAsDataURL(blob);
});

export async function saveNativeDownload(blob, filename) {
  if (!isNativeApp) return false;
  const safeName = String(filename || 'lumina-dados.json').replace(/[^a-zA-Z0-9._-]/g, '-');
  const base64 = await blobToBase64(blob);
  const written = await Filesystem.writeFile({
    path:safeName,
    data:base64,
    directory:Directory.Cache,
    recursive:true,
  });
  await Share.share({
    title:'Os meus dados Lumina',
    text:'Exportação da conta Lumina',
    url:written.uri,
    dialogTitle:'Guardar ou partilhar',
  });
  return true;
}
