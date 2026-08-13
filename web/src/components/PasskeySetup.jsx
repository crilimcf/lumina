import React, { useEffect, useState } from 'react';
import { listPasskeys, passkeySupported, registerPasskey, removePasskey } from '../passkeys.js';

export function PasskeySetup({ ping }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const supported = passkeySupported();
  const refresh = () => listPasskeys().then(setItems).catch(() => setItems([]));
  useEffect(() => { if (supported) refresh(); }, [supported]);

  if (!supported) return null;
  return <div className="card" style={{padding:20,marginBottom:14}}>
    <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>Face ID / biometria</div>
    <p style={{fontSize:14,lineHeight:1.45,color:'var(--grey)',marginBottom:14}}>Ativa neste dispositivo para poderes entrar sem escrever a password.</p>
    {items.map(item => <div key={item.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0'}}><span style={{flex:1,fontSize:13}}>{item.device_name || 'Este dispositivo'}</span><button type="button" className="p p-sm" onClick={async()=>{try{await removePasskey(item.id);await refresh();ping?.('Dispositivo removido');}catch(e){ping?.(e.message);}}}>Remover</button></div>)}
    <button type="button" className="p p-brand" disabled={busy} style={{width:'100%',padding:14,marginTop:items.length?8:0}} onClick={async()=>{setBusy(true);try{await registerPasskey();await refresh();ping?.('Face ID / biometria ativado');}catch(e){ping?.(e.message);}finally{setBusy(false);}}}>{busy?'A ativar…':items.length?'Adicionar outro dispositivo':'Ativar Face ID / biometria'}</button>
  </div>;
}
