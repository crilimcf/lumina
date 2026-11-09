import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/routes/creators.js', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../migrations/900_creators_foundation.sql', import.meta.url), 'utf8');

test('creator content endpoints require authenticated access', () => {
  assert.match(source, /post\('\/me\/content', auth,/);
  assert.match(source, /get\('\/me\/content', auth,/);
  assert.match(source, /get\('\/:creatorId\/content', auth,/);
});

test('premium reads require active, non-expired provider-backed memberships', () => {
  assert.match(source, /m\.status='active' AND m\.current_period_end>now\(\)/);
  assert.match(source, /m\.provider_subscription_id IS NOT NULL/);
  assert.match(source, /NOT EXISTS \(\s*SELECT 1 FROM blocks/);
});

test('membership cannot be marked active without verified provider identity', () => {
  assert.match(schema, /CHECK \(status <> 'active' OR \(provider_subscription_id IS NOT NULL AND current_period_end IS NOT NULL\)\)/);
});

test('feature is gated and no client endpoint grants a membership', () => {
  assert.match(source, /if \(!env\.FEATURE_SUBSCRIPTIONS\)/);
  assert.doesNotMatch(source, /UPDATE creator_memberships SET status='active'/);
});
