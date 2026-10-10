import assert from 'node:assert/strict';
import test from 'node:test';
import { isRadarSourceCoolingDown, radarRetryDelayMs } from '../src/jobs/radar-backoff.js';

const HOUR = 60 * 60_000;

test('permanent publisher errors back off but recover after the interval', () => {
  const now = Date.parse('2026-10-10T15:00:00Z');
  const source = {
    last_fetch_error:'Página oficial respondeu HTTP 403',
    last_fetched_at:new Date(now - 2 * HOUR).toISOString(),
  };
  assert.equal(radarRetryDelayMs(source.last_fetch_error), 12 * HOUR);
  assert.equal(isRadarSourceCoolingDown(source, now), true);
  assert.equal(isRadarSourceCoolingDown(source, now + 11 * HOUR), false);
});

test('unsafe XML is not parsed and has a timed retry', () => {
  const now = Date.now();
  const source = {
    last_fetch_error:'Feed XML com DTD/entidades não permitido',
    last_fetched_at:new Date(now - HOUR).toISOString(),
  };
  assert.equal(radarRetryDelayMs(source.last_fetch_error), 6 * HOUR);
  assert.equal(isRadarSourceCoolingDown(source, now), true);
  assert.equal(isRadarSourceCoolingDown(source, now + 5 * HOUR), false);
});

test('transient errors back off for less time and missing timestamps do not block retries', () => {
  const now = Date.now();
  assert.equal(radarRetryDelayMs('Timeout total ao obter fonte RSS'), 30 * 60_000);
  assert.equal(radarRetryDelayMs('Fonte RSS respondeu HTTP 429'), HOUR);
  assert.equal(radarRetryDelayMs('Feed XML inválido'), 15 * 60_000);
  assert.equal(isRadarSourceCoolingDown({last_fetch_error:'HTTP 403'}, now), false);
  assert.equal(isRadarSourceCoolingDown({last_fetched_at:new Date(now).toISOString()}, now), false);
  assert.equal(isRadarSourceCoolingDown({last_fetch_error:'HTTP 403',last_fetched_at:'bad-date'},now), false);
});
