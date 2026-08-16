import React, { useEffect, useState } from 'react';
import { listPasskeys, passkeySupported, registerPasskey, removePasskey } from '../passkeys.js';
import { isNativeApp } from '../native/session.js';

export function PasskeySetup() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const supported = passkeySupported();
  const refresh = () => listPasskeys().then(setItems).catch(() => setItems([]));
  useEffect(() => { if (supported) refresh(); }, [supported]);

  if (!supported) return null;
  return <div className="card" style={{padding:20,marginBottom:14}}>
    <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>Face ID / biometria</div>
    <p style={{fontSize:14,lineHeight:1.45,color:'var(--grey)',marginBottom:14}}>Ativa neste dispositivo para poderes entrar sem escrever a password.</p>
    {items.map(item => <div key={item.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0'}}><span style={{flex:1,fontSize:13}}>{item.device_name || 'Este dispositivo'}</span><button type="button" className="p p-sm" onClick={async()=>{setError('');setNotice('');try{await removePasskey(item.id);await refresh();setNotice('Dispositivo removido.');}catch(e){setError(e.message);}}}>Remover</button></div>)}
    <button type="button" className="p p-brand" disabled={busy} style={{width:'100%',padding:14,marginTop:items.length?8:0}} onClick={async()=>{setBusy(true);setError('');setNotice('');try{const result=await registerPasskey();if(!result?.external)await refresh();setNotice(result?.external?'A gestão segura de passkeys abriu no navegador. Volta à Lumina quando terminares.':'Face ID / biometria ativado neste dispositivo.');}catch(e){setError(e.message || 'Não foi possível ativar neste dispositivo.');}finally{setBusy(false);}}}>{busy?'A ativar…':isNativeApp?'Gerir passkeys com segurança':items.length?'Adicionar outro dispositivo':'Ativar Face ID / biometria'}</button>
    {notice&&<div role="status" style={{fontSize:12.5,color:'#1E9E62',marginTop:10,lineHeight:1.35}}>{notice}</div>}
    {error&&<div role="alert" style={{fontSize:12.5,color:'var(--coral)',marginTop:10,lineHeight:1.35}}>{error}</div>}
  </div>;
}
