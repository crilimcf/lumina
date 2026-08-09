import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeResolvedAddress, resolvePublicFeedTarget } from '../src/jobs/radar.js';

test('normaliza IPv4 público apresentado como IPv4-mapped IPv6', async () => {
  assert.deepEqual(normalizeResolvedAddress('::ffff:93.184.216.34', 6), {
    address: '93.184.216.34',
    family: 4,
  });
  assert.deepEqual(normalizeResolvedAddress('::ffff:5db8:d822', 6), {
    address: '93.184.216.34',
    family: 4,
  });

  const target = await resolvePublicFeedTarget('https://feed.example.test/rss', {
    lookup: async () => [{ address: '::ffff:93.184.216.34', family: 6 }],
  });
  assert.equal(target.address, '93.184.216.34');
  assert.equal(target.family, 4);
  assert.equal(target.url.hostname, 'feed.example.test');
});

test('continua a bloquear IPv4 privado mesmo quando vem mapeado em IPv6', async () => {
  await assert.rejects(
    () => resolvePublicFeedTarget('https://feed.example.test/rss', {
      lookup: async () => [{ address: '::ffff:127.0.0.1', family: 6 }],
    }),
    /privada|reservada/
  );

  await assert.rejects(
    () => resolvePublicFeedTarget('https://feed.example.test/rss', {
      lookup: async () => [{ address: '::ffff:0a01:0203', family: 6 }],
    }),
    /privada|reservada/
  );
});
