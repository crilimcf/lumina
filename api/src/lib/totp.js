import crypto from 'node:crypto';

/**
 * TOTP (RFC 6238) — os códigos de seis dígitos das apps de autenticação.
 *
 * São umas quarenta linhas de HMAC. Uma biblioteca para isto traria uma
 * dependência a mais na cadeia de autenticação, que é o pior sítio para ter
 * código que não controlamos.
 */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateSecret(bytes = 20) {
  const buf = crypto.randomBytes(bytes);
  let bits = '', out = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function fromBase32(s) {
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error('Segredo inválido');
    bits += i.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function codeAt(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', fromBase32(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const num = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16)
            | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(num % 1_000_000).padStart(6, '0');
}

/**
 * Verifica um código.
 *
 * Aceita a janela anterior e a seguinte porque os relógios andam ligeiramente
 * desencontrados — sem isso, metade das pessoas não consegue entrar.
 * A comparação é em tempo constante.
 */
export function verifyTotp(secret, token, window = 1) {
  const clean = String(token || '').replace(/\D/g, '');
  if (clean.length !== 6) return false;
  const counter = Math.floor(Date.now() / 30_000);
  for (let i = -window; i <= window; i++) {
    const expected = codeAt(secret, counter + i);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return true;
  }
  return false;
}

/** URI para o QR code das apps de autenticação. */
export function otpauthUri(secret, email, issuer = 'Lumina') {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params}`;
}

/** Códigos de emergência, para quem perde o telemóvel. */
export function generateRecoveryCodes(n = 8) {
  return Array.from({ length: n }, () =>
    crypto.randomBytes(5).toString('hex').match(/.{1,5}/g).join('-'));
}

export const hashCode = (c) =>
  crypto.createHash('sha256').update(c.replace(/-/g, '').toLowerCase()).digest('hex');
