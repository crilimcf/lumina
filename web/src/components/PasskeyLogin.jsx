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
    <button type="button" onClick={run} disabled={busy} aria-label={label} style={{width:'100%',padding:0,border:0,borderRadius:999,overflow:'hidden',background:'transparent',cursor:'pointer',font:'inherit'}}>
      <span style={{width:'100%',minHeight:58,padding:'15px 20px',display:'flex',alignItems:'center',justifyContent:'center',gap:10,borderRadius:999,background:'linear-gradient(135deg,#182541 0%,#10182b 55%,#26345a 100%)',color:'#ffffff',fontSize:15,fontWeight:800,letterSpacing:'-.01em',boxShadow:'0 10px 28px rgba(4,9,22,.28), inset 0 1px 0 rgba(255,255,255,.12)'}}>
        <span aria-hidden="true" style={{fontSize:20,lineHeight:1}}>◉</span>
        <span>{busy?t('Um momento…'):label}</span>
      </span>
    </button>
    {error&&<div role="alert" style={{fontSize:12.5,color:'var(--coral)',lineHeight:1.35}}>{error}</div>}
  </div>;
}
