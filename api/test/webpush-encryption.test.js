import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { declarativePayload, encryptWebPushPayload } from '../src/lib/webpush.js';

const hmac = (key, value) => crypto.createHmac('sha256', key).update(value).digest();
const expandOne = (prk, info, length) => hmac(prk, Buffer.concat([info, Buffer.from([1])])).subarray(0, length);

test('encryptWebPushPayload produz um registo aes128gcm que o browser consegue desencriptar', () => {
  const client = crypto.createECDH('prime256v1');
  const uaPublic = client.generateKeys();
  const authSecret = crypto.randomBytes(16);
  const payload = {
    web_push:8030,
    notification:{
      title:'Chamada de Ana',
      body:'Chamada de áudio recebida',
      navigate:'https://lumina-snowy-ten.vercel.app/?tab=dms&call=abc',
      silent:false,
    },
  };

  const body = encryptWebPushPayload(payload, {
    p256dh:uaPublic.toString('base64url'),
    auth:authSecret.toString('base64url'),
  });

  assert.equal(body.subarray(16,20).readUInt32BE(), 4096);
  const keyLength = body[20];
  assert.equal(keyLength, 65);
  const salt = body.subarray(0,16);
  const asPublic = body.subarray(21,21 + keyLength);
  const encrypted = body.subarray(21 + keyLength);

  const sharedSecret = client.computeSecret(asPublic);
  const prkKey = hmac(authSecret, sharedSecret);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = expandOne(prkKey, keyInfo, 32);
  const prk = hmac(salt, ikm);
  const cek = expandOne(prk, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = expandOne(prk, Buffer.from('Content-Encoding: nonce\0'), 12);

  const tag = encrypted.subarray(-16);
  const ciphertext = encrypted.subarray(0,-16);
  const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  assert.equal(plaintext.at(-1), 2, 'o último registo tem de terminar no delimiter 0x02');
  assert.deepEqual(JSON.parse(plaintext.subarray(0,-1).toString('utf8')), payload);
});

test('encryptWebPushPayload rejeita subscrições sem chaves válidas', () => {
  assert.throws(() => encryptWebPushPayload({ web_push:8030 }, { p256dh:'x', auth:'y' }), /inválidas/);
});


test('declarative Web Push envia app_badge zero no nível superior', () => {
  const payload = declarativePayload({ title:'Lumina', body:'Teste', url:'/?tab=alerts' }, 0);
  assert.equal(payload.app_badge, '0');
  assert.equal(payload.notification.app_badge, undefined);
});
