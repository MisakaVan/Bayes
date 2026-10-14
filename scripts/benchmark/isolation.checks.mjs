import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkIsolation } from './isolation.mjs';
import { readFileSync } from 'node:fs';

test('unprovisioned environment cannot run', () => {
  const config = JSON.parse(readFileSync('wrangler.benchmark.example.json', 'utf8'));
  assert.ok(checkIsolation(config, '').some((error) => error.includes('unprovisioned')));
});
test('production IDs, external DOs and queues are rejected', () => {
  const config = JSON.parse(readFileSync('wrangler.benchmark.example.json', 'utf8'));
  config.d1_databases[0].database_id = 'production-id';
  config.durable_objects.bindings[0].script_name = 'production-worker';
  config.queues.producers[0].queue = 'production-queue';
  const errors = checkIsolation(config, 'database_id = "production-id"\nqueue = "production-queue"');
  assert.ok(errors.includes('D1 id: production resource'));
  assert.ok(errors.includes('Queue producer: production resource'));
  assert.ok(errors.includes('External DO namespace is not allowed'));
});
