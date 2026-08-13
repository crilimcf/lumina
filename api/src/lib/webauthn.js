import crypto from 'node:crypto';
import { q } from '../db.js';
import { env } from '../env.js';
import { HttpError, bad } from '../middleware/auth.js';

const b64u = (value) => Buffer.from(value).toString('base64url');
const fromB64u = (value) => Buffer.from(String(value || ''), 'base64url');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest();

const configuredOrigins = () => {
  const raw = env.WEBAUTHN_ORIGINS || env.CORS_ORIGIN || env.APP_URL;
  return String(raw || '').split(',').map(v => v.trim()).filter(Boolean).map(v => new URL(v).origin);
};

export const webauthnRpId = () => env.WEBAUTHN_RP_ID || new URL(configuredOrigins()[0] || env.APP_URL).hostname;

const assertExpectedOrigin = (origin) => {
  if (!configuredOrigins().includes(origin)) throw new HttpError(401, 'Origem WebAuthn inválida', 'passkey_origin');
};

export async function createWebauthnChallenge(userId, purpose) {
  const challenge = b64u(crypto.randomBytes(32));
  await q('DELETE FROM webauthn_challenges WHERE expires_at <= now()');
  await q(
    `INSERT INTO webauthn_challenges (challenge, user_id, purpose, expires_at)
     VALUES ($1, $2, $3, now() + interval '5 minutes')`,
    [challenge, userId || null, purpose]
  );
  return challenge;
}

export async function consumeWebauthnChallenge(challenge, purpose, userId = null) {
  const params = [challenge, purpose];
  let userClause = '';
  if (userId) {
    params.push(userId);
    userClause = ` AND user_id = $${params.length}`;
  }
  const { rows } = await q(
    `DELETE FROM webauthn_challenges
     WHERE challenge = $1 AND purpose = $2 AND expires_at > now()${userClause}
     RETURNING user_id`,
    params
  );
  if (!rows[0]) throw new HttpError(401, 'Desafio WebAuthn expirado ou inválido', 'passkey_challenge');
  return rows[0];
}

function readLength(buffer, offset, additional) {
  if (additional < 24) return { length: additional, offset };
  if (additional === 24) return { length: buffer.readUInt8(offset), offset: offset + 1 };
  if (additional === 25) return { length: buffer.readUInt16BE(offset), offset: offset + 2 };
  if (additional === 26) return { length: buffer.readUInt32BE(offset), offset: offset + 4 };
  throw bad('CBOR WebAuthn não suportado', 'passkey_cbor');
}

export function decodeCborAt(buffer, start = 0) {
  let offset = start;
  if (offset >= buffer.length) throw bad('CBOR WebAuthn incompleto', 'passkey_cbor');
  const initial = buffer[offset++];
  const major = initial >> 5;
  const additional = initial & 31;

  if (major === 0 || major === 1) {
    const out = readLength(buffer, offset, additional);
    const value = major === 0 ? out.length : -1 - out.length;
    return { value, offset: out.offset };
  }

  if (major === 2 || major === 3) {
    const out = readLength(buffer, offset, additional);
    const end = out.offset + out.length;
    if (end > buffer.length) throw bad('CBOR WebAuthn incompleto', 'passkey_cbor');
    const slice = buffer.subarray(out.offset, end);
    return { value: major === 2 ? Buffer.from(slice) : slice.toString('utf8'), offset: end };
  }

  if (major === 4) {
    const out = readLength(buffer, offset, additional);
    const arr = [];
    offset = out.offset;
    for (let i = 0; i < out.length; i++) {
      const item = decodeCborAt(buffer, offset);
      arr.push(item.value);
      offset = item.offset;
    }
    return { value: arr, offset };
  }

  if (major === 5) {
    const out = readLength(buffer, offset, additional);
    const map = new Map();
    offset = out.offset;
    for (let i = 0; i < out.length; i++) {
      const key = decodeCborAt(buffer, offset); offset = key.offset;
      const value = decodeCborAt(buffer, offset); offset = value.offset;
      map.set(key.value, value.value);
    }
    return { value: map, offset };
  }

  if (major === 7 && additional === 20) return { value: false, offset };
  if (major === 7 && additional === 21) return { value: true, offset };
  if (major === 7 && additional === 22) return { value: null, offset };
  throw bad('Tipo CBOR WebAuthn não suportado', 'passkey_cbor');
}

function parseClientData(encoded, expectedType) {
  let raw;
  let data;
  try {
    raw = fromB64u(encoded);
    data = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new HttpError(401, 'Dados WebAuthn inválidos', 'passkey_client_data');
  }
  if (data.type !== expectedType) throw new HttpError(401, 'Cerimónia WebAuthn inválida', 'passkey_type');
  if (!data.challenge) throw new HttpError(401, 'Desafio WebAuthn em falta', 'passkey_challenge');
  assertExpectedOrigin(data.origin);
  if (data.crossOrigin === true) throw new HttpError(401, 'WebAuthn cross-origin não permitido', 'passkey_cross_origin');
  return { raw, data };
}

function parseAuthenticatorData(buffer, requireAttested = false) {
  if (buffer.length < 37) throw new HttpError(401, 'Authenticator data inválido', 'passkey_auth_data');
  const rpHash = buffer.subarray(0, 32);
  if (!crypto.timingSafeEqual(rpHash, sha256(webauthnRpId()))) {
    throw new HttpError(401, 'RP ID WebAuthn inválido', 'passkey_rp');
  }
  const flags = buffer[32];
  if ((flags & 0x01) === 0) throw new HttpError(401, 'Presença do utilizador não confirmada', 'passkey_up');
  if ((flags & 0x04) === 0) throw new HttpError(401, 'Biometria/PIN não confirmados', 'passkey_uv');
  const signCount = buffer.readUInt32BE(33);

  if (!requireAttested) return { flags, signCount };
  if ((flags & 0x40) === 0 || buffer.length < 55) throw new HttpError(401, 'Credencial WebAuthn incompleta', 'passkey_attested');
  const credentialIdLength = buffer.readUInt16BE(53);
  const credentialIdStart = 55;
  const credentialIdEnd = credentialIdStart + credentialIdLength;
  if (credentialIdEnd > buffer.length) throw new HttpError(401, 'Credential ID inválido', 'passkey_credential');
  const credentialId = Buffer.from(buffer.subarray(credentialIdStart, credentialIdEnd));
  const cose = decodeCborAt(buffer, credentialIdEnd).value;
  if (!(cose instanceof Map)) throw new HttpError(401, 'Chave pública WebAuthn inválida', 'passkey_key');
  return { flags, signCount, credentialId, cose };
}

function coseEc2ToJwk(cose) {
  if (cose.get(1) !== 2 || cose.get(3) !== -7 || cose.get(-1) !== 1) {
    throw new HttpError(400, 'Este autenticador não usa uma chave compatível', 'passkey_algorithm');
  }
  const x = cose.get(-2);
  const y = cose.get(-3);
  if (!Buffer.isBuffer(x) || !Buffer.isBuffer(y) || x.length !== 32 || y.length !== 32) {
    throw new HttpError(400, 'Chave pública WebAuthn inválida', 'passkey_key');
  }
  return { kty: 'EC', crv: 'P-256', x: b64u(x), y: b64u(y), ext: true, key_ops: ['verify'] };
}

export async function registrationOptions(user) {
  const challenge = await createWebauthnChallenge(user.id, 'registration');
  const { rows } = await q('SELECT credential_id, transports FROM passkeys WHERE user_id = $1 ORDER BY created_at DESC', [user.id]);
  return {
    challenge,
    rp: { id: webauthnRpId(), name: 'Lumina' },
    user: {
      id: b64u(Buffer.from(String(user.id), 'utf8')),
      name: user.email,
      displayName: user.name || user.handle,
    },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    timeout: 60_000,
    attestation: 'none',
    authenticatorSelection: {
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'required',
    },
    excludeCredentials: rows.map(row => ({
      type: 'public-key',
      id: row.credential_id,
      transports: row.transports || [],
    })),
  };
}

export async function verifyRegistration(user, credential, deviceName = '') {
  if (!credential?.id || !credential?.response?.clientDataJSON || !credential?.response?.attestationObject) {
    throw bad('Credencial passkey incompleta', 'passkey_payload');
  }
  const client = parseClientData(credential.response.clientDataJSON, 'webauthn.create');
  await consumeWebauthnChallenge(client.data.challenge, 'registration', user.id);

  const attestationObject = fromB64u(credential.response.attestationObject);
  const decoded = decodeCborAt(attestationObject).value;
  if (!(decoded instanceof Map) || decoded.get('fmt') !== 'none' || !Buffer.isBuffer(decoded.get('authData'))) {
    throw new HttpError(400, 'Atestação passkey não suportada', 'passkey_attestation');
  }
  const parsed = parseAuthenticatorData(decoded.get('authData'), true);
  const idFromAuthData = b64u(parsed.credentialId);
  const idFromBrowser = credential.rawId || credential.id;
  if (idFromAuthData !== idFromBrowser || credential.id !== idFromBrowser) {
    throw new HttpError(401, 'Credential ID não coincide', 'passkey_credential');
  }
  const jwk = coseEc2ToJwk(parsed.cose);
  const transports = Array.isArray(credential.response.transports)
    ? credential.response.transports.map(v => String(v).slice(0, 32)).slice(0, 8)
    : [];
  const safeName = String(deviceName || 'Passkey').trim().slice(0, 80) || 'Passkey';

  const { rows } = await q(
    `INSERT INTO passkeys (user_id, credential_id, public_key_jwk, sign_count, transports, device_name)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (credential_id) DO UPDATE
       SET public_key_jwk = EXCLUDED.public_key_jwk,
           sign_count = EXCLUDED.sign_count,
           transports = EXCLUDED.transports,
           device_name = EXCLUDED.device_name
       WHERE passkeys.user_id = EXCLUDED.user_id
     RETURNING id, device_name, created_at, last_used_at`,
    [user.id, credential.id, jwk, parsed.signCount, transports, safeName]
  );
  if (!rows[0]) throw new HttpError(409, 'Esta passkey já pertence a outra conta', 'passkey_duplicate');
  return rows[0];
}

export async function authenticationOptions() {
  return {
    challenge: await createWebauthnChallenge(null, 'authentication'),
    rpId: webauthnRpId(),
    timeout: 60_000,
    userVerification: 'required',
    allowCredentials: [],
  };
}

export async function verifyAuthentication(credential) {
  if (!credential?.id || !credential?.response?.clientDataJSON || !credential?.response?.authenticatorData || !credential?.response?.signature) {
    throw new HttpError(401, 'Credencial passkey incompleta', 'passkey_payload');
  }
  const client = parseClientData(credential.response.clientDataJSON, 'webauthn.get');
  await consumeWebauthnChallenge(client.data.challenge, 'authentication');

  const { rows } = await q(
    `SELECT p.id AS passkey_id, p.user_id, p.public_key_jwk, p.sign_count,
            u.id, u.handle, u.name, u.bio, u.palette, u.avatar_url, u.stars, u.created_at,
            u.session_version, u.suspended_at, u.totp_enabled_at
     FROM passkeys p
     JOIN users u ON u.id = p.user_id
     WHERE p.credential_id = $1`,
    [credential.id]
  );
  const row = rows[0];
  if (!row || row.suspended_at) throw new HttpError(401, 'Passkey não reconhecida', 'passkey_unknown');

  const authenticatorData = fromB64u(credential.response.authenticatorData);
  const parsed = parseAuthenticatorData(authenticatorData, false);
  const signedData = Buffer.concat([authenticatorData, sha256(client.raw)]);
  let publicKey;
  try { publicKey = crypto.createPublicKey({ key: row.public_key_jwk, format: 'jwk' }); }
  catch { throw new HttpError(401, 'Chave passkey inválida', 'passkey_key'); }
  const valid = crypto.verify('sha256', signedData, publicKey, fromB64u(credential.response.signature));
  if (!valid) throw new HttpError(401, 'Assinatura passkey inválida', 'passkey_signature');

  const previous = Number(row.sign_count || 0);
  if (previous > 0 && parsed.signCount > 0 && parsed.signCount <= previous) {
    throw new HttpError(401, 'Contador passkey inválido', 'passkey_counter');
  }
  await q(
    `UPDATE passkeys SET sign_count = GREATEST(sign_count, $2), last_used_at = now() WHERE id = $1`,
    [row.passkey_id, parsed.signCount]
  );

  const user = {
    id: row.id,
    handle: row.handle,
    name: row.name,
    bio: row.bio,
    palette: row.palette,
    avatar_url: row.avatar_url,
    stars: row.stars,
    created_at: row.created_at,
    session_version: row.session_version,
    two_factor: !!row.totp_enabled_at,
  };
  return user;
}
