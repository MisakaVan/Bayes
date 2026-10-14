import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareReports, summarize, aggregateReports } from './report.mjs';

const report = (values = [1, 1, 1]) => ({ schemaVersion: 1, environment: 'remote', metadata: {
  fixtureHash: 'fixture', configHash: 'config', runtime: 'runtime'
}, scenarios: [{ id: 'read', workloadHash: 'workload', attempts: values?.length ?? 3, failures: 0, correct: true,
  measurements: { workerCpuMs: values }, operations: { 'd1.query': 1 } }] });
const policy = { schemaVersion: 1, rules: [{ scenario: '*', kind: 'measurement', metric: 'workerCpuMs',
  statistic: 'p95', minSamples: 3, maxRatio: 1.05 }] };

test('missing CPU and insufficient samples cannot pass', () => {
  assert.equal(compareReports(report(), report(null), policy).status, 'insufficient');
  assert.equal(compareReports(report(), report([1]), policy).status, 'insufficient');
});
test('regressions and incomplete responses fail', () => {
  assert.equal(compareReports(report(), report([2, 2, 2]), policy).status, 'fail');
  const next = report(); next.scenarios[0].failures = 1;
  assert.equal(compareReports(report(), next, policy).status, 'fail');
});
test('incompatible datasets are not compared and invalid numbers are rejected', () => {
  const next = report(); next.metadata.fixtureHash = 'other';
  assert.throws(() => compareReports(report(), next, policy), /Incompatible fixtureHash/);
  assert.throws(() => summarize([NaN]), /finite/);
  assert.throws(() => summarize([-1]), /finite/);
});
test('operations cannot grow from a zero baseline', () => {
  const before = report(), after = report(); before.scenarios[0].operations['d1.query'] = 0;
  assert.equal(compareReports(before, after, { schemaVersion: 1, rules: [
    { scenario: '*', kind: 'operation', metric: 'd1.query', maxRatio: 1 }
  ] }).status, 'fail');
});

test('a remote regression policy requires independent rounds and version identity', () => {
  const rule = { ...policy.rules[0], minRounds: 5 };
  assert.equal(compareReports(report(), report(), { ...policy, rules: [rule] }).status, 'insufficient');
  const first = report(); first.metadata.runId = 'first'; first.metadata.versionId = 'version';
  const second = report(); second.metadata.runId = 'second'; second.metadata.versionId = 'version';
  const aggregate = aggregateReports([first, second]);
  assert.equal(aggregate.metadata.rounds, 2);
  assert.equal(aggregate.scenarios[0].attempts, 6);
  assert.deepEqual(aggregate.scenarios[0].roundStatistics.workerCpuMs.p95, [1, 1]);
  assert.throws(() => aggregateReports([first, first]), /Duplicate/);
  second.metadata.versionId = 'other';
  assert.throws(() => aggregateReports([first, second]), /Incompatible/);
});
