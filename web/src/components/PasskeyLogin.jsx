import React, { useState } from 'react';
import { credentialToJSON, passkeyLoginLabel, passkeySupported } from '../passkeys.js';
import { t } from '../i18n.js';

const BASE = import.meta.env.VITE_API_URL || '/api';
const b64uToBytes = value => {
  const input = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = input + '='.repeat((4 - input.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
};
const requestOptions = json => PublicKeyCredential.parseRequestOptionsFromJSON
  ? PublicKeyCredential.parseRequestOptionsFromJSON(json)
  : {
      ...json,
      challenge:b64uToBytes(json.challenge),
      allowCredentials:(json.allowCredentials || []).map(item => ({ ...item, id:b64uToBytes(item.id) })),
    };

async function login() {
  const optionsResponse = await fetch(`${BASE}/auth/passkeys/options`, { credentials:'include', cache:'no-store' });
  const options = await optionsResponse.json().catch(() => ({}));
  if (!optionsResponse.ok) throw new Error(options?.error || 'Não foi possível iniciar a passkey.');
  const credential = await navigator.credentials.get({ publicKey:requestOptions(options) });
  if (!credential) return null;
  const response = await fetch(`${BASE}/auth/passkeys/login`, {
    method:'POST', credentials:'include', cache:'no-store',
    headers:{ 'content-type':'application/json', Accept:'application/json' },
    body:JSON.stringify({ credential:credentialToJSON(credential) }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'Não foi possível entrar com passkey.');
  return body;
}

export function PasskeyLogin({ onIn, disabled = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!passkeySupported()) return null;
  const label = t(passkeyLoginLabel());

  const run = async () => {
    setBusy(true); setError('');
    try {
      const out = await login();
      if (out?.user) onIn(out.user, false);
    } catch (e) {
      if (!['NotAllowedError','AbortError'].includes(e?.name)) setError(e?.message || 'Passkey indisponível');
    } finally { setBusy(false); }
  };

  return <div style={{ display:'grid', gap:8, marginTop:2 }}>
    <div className="m" aria-hidden="true" style={{ display:'flex',alignItems:'center',gap:10,opacity:.55 }}><span style={{height:1,background:'currentColor',flex:1}}/><span>ou</span><span style={{height:1,background:'currentColor',flex:1}}/></div>
    <button type="button" className="p p-ink" onClick={run} disabled={disabled || busy} style={{ width:'100%',padding:15,fontSize:15 }} aria-label={label}>
      {busy ? t('Um momento…') : `◉  ${label}`}
    </button>
    {error && <div role="alert" style={{ fontSize:12.5,color:'var(--coral)',lineHeight:1.35 }}>{error}</div>}
  </div>;
}
