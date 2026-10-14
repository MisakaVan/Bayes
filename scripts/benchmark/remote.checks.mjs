import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attachTelemetry, validResponse, validateManifest } from './remote.mjs';

test('partial responses never count as successful operations', () => {
  assert.equal(validResponse({ items: [], partial: true }, { arrays: { items: { min: 0, max: 1 } } }), false);
  assert.equal(validResponse({ items: [] }, { arrays: { items: { min: 1, max: 1 } } }), false);
});
test('unknown CPU and wrong-run telemetry remain unavailable', () => {
  const report = { metadata: { runId: 'run' }, gaps: [], scenarios: [{ id: 'read', attempts: 1,
    observations: [{ sampleId: 'sample' }], measurements: { workerCpuMs: null }, operations: {} }] };
  attachTelemetry(report, [{ sample_id: 'sample', run_id: 'other', scenario: 'read', cpu_ms: 1 }]);
  assert.equal(report.scenarios[0].measurements.workerCpuMs, null);
  assert.equal(report.gaps.length, 1);
});
test('production URLs, escaped paths and impossible budgets cannot be scheduled', () => {
  const manifest = JSON.parse(readFileSync('benchmark/remote.example.json', 'utf8'));
  manifest.baseUrl = 'https://api.opendfieldmap.org';
  assert.throws(() => validateManifest(manifest), /dedicated/);
  manifest.baseUrl = 'https://oem-backend-benchmark.example.workers.dev';
  manifest.scenarios[0].path = '//api.opendfieldmap.org';
  assert.throws(() => validateManifest(manifest), /Invalid scenario/);
  manifest.scenarios[0].path = '/health/v1/status'; manifest.maxRequests = 1;
  assert.throws(() => validateManifest(manifest), /budget/);
});
