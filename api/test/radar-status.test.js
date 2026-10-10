import assert from 'node:assert/strict';
import test from 'node:test';
import { formatRadarSyncStatus } from '../src/jobs/radar-status.js';

test('Radar distingue tentativas de fontes colocadas em cooldown', () => {
  assert.equal(
    formatRadarSyncStatus(
      { attempted:5, succeeded:5, failed:0, items:80, cooldown:30 },
      { attempted:1, succeeded:1, failed:0, items:1, cooldown:4 },
      1452
    ),
    '6/6 fontes consultadas · 81 itens · 34 fontes em espera · 0 falhas · 1452 ms'
  );
});

test('Radar mostra falhas efetivas e silêncio quando não há fontes', () => {
  assert.equal(formatRadarSyncStatus({}, {}, 42), null);
  assert.equal(
    formatRadarSyncStatus({ attempted:1, succeeded:0, failed:1 }, {}, 5),
    '0/1 fontes consultadas · 0 itens · 0 fontes em espera · 1 falhas · 5 ms'
  );
  assert.match(formatRadarSyncStatus({ cooldown:2 }, {}, 1), /2 fontes em espera/);
});
