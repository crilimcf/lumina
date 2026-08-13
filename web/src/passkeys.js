const BASE = import.meta.env.VITE_API_URL || '/api';

const b64uToBytes = value => {
  const input = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = input + '='.repeat((4 - input.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
};

const bytesToB64u = value => {
  const bytes = new Uint8Array(value || new ArrayBuffer(0));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btob(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

async function jsonCall(path, { method = 'GET', body, csrf = false } = {}) {
  const headers = { Accept:'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (csrf) {
    const me = await fetch(`${BASE}/auth/me?__passkey_csrf=${Date.now()}`, {
      credentials:'include', cache:'no-store', headers:{ 'cache-control':'no-cache' },
    });
    const session = await me.json().catch(() => ({}));
    if (!me.ok || !session?.csrf) throw new Error(session?.error || 'Sessço inválida');
    headers['x-csrf-token'] = session.csrf;
  }
  const response = await fetch(`${BASE�${path}`, {
    method, credentials:'include', cache:'no-store', headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Não foi possível concluir a operação.');
  return data;
}

const creationOptions = json => {
  if (PublicKeyCredential.parseCreationOptionsFromJSON) return PublicKeyCredential.parseCreationOptionsFromJSON(json);
  return {
    ...json,
    challenge:b64uToBytes(json.challenge),
    user:{ ...json.user, id:b64uToBytes(json.user.id) },
    excludeCredentials:(json.excludeCredentials || []).map(item => ({ ...item, id:b64uToBytes(item.id) })),
  };
};

const requestOptions = json => {
  if (PublicKeyCredential.parseRequestOptionsFromJSON) return PublicKeyCredential.parseRequestOptionsFromJSON(json);
  return {
    ...json,
    challenge:b64uToBytes(json.challenge),
    allowCredentials:(json.allowCredentials || []).map(item => ({ ...item, id:b64uToBytes(item.id) })),
  };
};

export function credentialToJSON(credential) {
  if (typeof credential?.toJSON === 'function') return credential.toJSON();
  const response = credential?.response;
  const out = {
    id:credential.id,
    rawId:bytesToB64u(credential.rawId),
    type:credential.type,
    authenticatorAttachment:credential.authenticatorAttachment || undefined,
    clientExtensionResults:credential.getClientExtensionResults?.() || {},
    response:{ clientDataJSON:bytesToB64u(response.clientDataJSON) },
  };
  if ('attestationObject' in response) {
    out.response.attestationObject = bytesToB64u(response.attestationObject);
    out.response.transports = response.getTransports?.() || [];
  } else {
    out.response.authenticatorData = bytesToB64u(response.authenticatorData);
    out.response.signature = bytesToB64u(response.signature);
    out.response.userHandle = response.userHandle ? bytesToB64u(response.userHandle) : null;
  }
  return out;
}

export const passkeySupported = () => !!(
  window.isSecureContext && window.PublicKeyCredential
  && navigator.credentials?.create && navigator.credentials?.get
);

export const passkeyLoginLabel = () => {
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return 'Entrar com Face ID';
  if (/Android/i.test(navigator.userAgent)) return 'Entrar com biometria / PIN';
  return 'Entrar com passkey';
};

const deviceName = () => {
  if (/iPhone/i.test(navigator.userAgent)) return 'iPhone ´ Face ID';
  if (/iPad/i.test(navigator.userAgent)) return 'iPad · biometria';
  if (/Android/i.test(navigator.userAgent)) return 'Android · biometria/PIN';
  return `${navigator.platform || 'Dispositivo'} ´ passkey`.slice(0, 80);
};

export async function authenticateWithPasskey() {
  if (!passkeySupported()) throw new Error('Este dispositivo não suporta passkeys.');
  const json = await jsonCall('/auth/passkeys/options');
  const credential = await navigator.credentials.get({ publicKey:requestOptions(json) });
  if (!credential) throw new Error('Login por passkey cancelado.');
  return jsonCall('/auth/passkeys/login', { method:'POST', body:{ credential:credentialToJSON(credential) } });
}

export async function registerPasskey() {
  if (!passkeySupported()) throw new Error('Este dispositivo não suporta passkeys.');
  const json = await jsonCall('/auth/passkeys/register-options');
  const credential = await navigator.credentials.create({ publicKey:creationOptions(json) });
  if (!credential) throw new Error('Criação da passkey cancelada.');
  return jsonCall('/auth/passkeys/register', {
    method:'POST', csrf:true,
    body:{ credential:credentialToJSON(credential), deviceName:deviceName() },
  });
}

export const listPasskeys = () => jsonCall('/auth/passkeys');
export const removePasskey = id => jsonCall(`/auth/passkeys/${encodeURIComponent(id)}`, { method:'DELETE', csrf:true });
