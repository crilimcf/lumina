import React, { useState } from 'react';
import { authenticateWithPasskey, passkeyLoginLabel, passkeySupported } from '../passkeys.js';
import { t } from '../i18n.js';

export function PasskeyLogin({ onIn }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!passkeySupported()) return null;
  const label=t(passkeyLoginLabel());
  const run=async()=>{
    setBusy(true); setError('');
    try { const out=await authenticateWithPasskey(); if(out?.user) onIn(out.user,false); }
    catch(e){ if(!['NotAllowedError','AbortError'].includes(e?.name)) setError(e?.message||'Passkey indisponível'); }
    finally { setBusy(false); }
  };
  return <div style={{display:'grid',gap:8,marginTop:2}}>
    <div className="m" aria-hidden="true" style={{display:'flex',alignItems:'center',gap:10,opacity:.55}}><span style={{height:1,background:'currentColor',flex:1}}/><span>ou</span><span style={{height:1,background:'currentColor',flex:1}}/></div>
    <button type="button" className="p p-ink" onClick={run} disabled={busy} style={{width:'100%',padding:15,fontSize:15}} aria-label={label}>{busy?t('Um momento…'):`◉  ${label}`}</button>
    {error&&<div role="alert" style={{fontSize:12.5,color:'var(--coral)',lineHeight:1.35}}>{error}</div>}
  </div>;
}
