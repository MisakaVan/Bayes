import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { assertIsolation } from './isolation.mjs';
import { hash, markdownReport } from './report.mjs';

export function validateManifest(manifest) {
  for (const key of ['ratePerSecond', 'maxConcurrency', 'timeoutMs', 'maxRequests', 'maxDurationMs', 'samplesPerScenario']) {
    if (!Number.isFinite(manifest[key]) || manifest[key] <= 0) throw new Error(`Invalid ${key}`);
  }
  if (!Number.isInteger(manifest.samplesPerScenario) || !Number.isInteger(manifest.maxRequests)
    || !Number.isInteger(manifest.maxConcurrency) || !Number.isInteger(manifest.warmupPerScenario)
    || manifest.warmupPerScenario < 0 || manifest.ratePerSecond > 1000 || manifest.maxConcurrency > 100
    || manifest.timeoutMs > 60000 || manifest.maxDurationMs > 3600000) throw new Error('Invalid run bounds');
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.scenarios) || !manifest.scenarios.length || !manifest.runtime) throw new Error('Invalid manifest');
  const ids = new Set();
  for (const scenario of manifest.scenarios) {
    if (!/^[a-zA-Z0-9_./-]{1,160}$/.test(scenario.id) || ids.has(scenario.id)) throw new Error('Invalid scenario ID');
    ids.add(scenario.id);
    if (!scenario.path.startsWith('/') || scenario.path.startsWith('//') || /[\\\r\n]/.test(scenario.path)
      || !['GET','POST','PUT','PATCH','DELETE'].includes(scenario.method)
      || !scenario.expect || !Number.isInteger(scenario.expect.status)) throw new Error('Invalid scenario request');
    if (scenario.method !== 'GET' && !scenario.body) throw new Error('Write scenarios require an explicit test body');
    for (const bounds of Object.values(scenario.expect.arrays ?? {})) {
      if (!Number.isInteger(bounds.min) || !Number.isInteger(bounds.max) || bounds.min < 0 || bounds.max < bounds.min) throw new Error('Invalid response cardinality contract');
    }
  }
  const attempts = manifest.scenarios.length * (manifest.samplesPerScenario + manifest.warmupPerScenario);
  // Include identity calibration and leave enough time for the final request.
  if (attempts + 1 > manifest.maxRequests || attempts / manifest.ratePerSecond * 1000 + manifest.timeoutMs > manifest.maxDurationMs) {
    throw new Error('Scheduled workload exceeds the run budget');
  }
  const url = new URL(manifest.baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || (url.pathname !== '/' && url.pathname !== '') || /REPLACE|opendfieldmap\.(?:org|cn)$/i.test(url.hostname)) {
    throw new Error('A dedicated HTTPS benchmark origin is required');
  }
  return attempts;
}

export function validResponse(body, expect) {
  if (!body || typeof body !== 'object' || body.partial === true) return false;
  for (const [key, value] of Object.entries(expect.equals ?? {})) if (body[key] !== value) return false;
  for (const [key, bounds] of Object.entries(expect.arrays ?? {})) {
    if (!Array.isArray(body[key]) || body[key].length < bounds.min || body[key].length > bounds.max) return false;
  }
  return true;
}

export async function runRemote(manifestPath, outputPath, telemetryPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  validateManifest(manifest);
  const config = assertIsolation(manifest.config);
  if (manifest.runtime !== `cloudflare/${config.compatibility_date}`) throw new Error('Runtime label differs from the configured compatibility date');
  if (new URL(config.vars.BETTER_AUTH_URL).origin !== new URL(manifest.baseUrl).origin) throw new Error('Configured origin differs from the run target');
  const token = process.env.BENCHMARK_TOKEN;
  if (!token) throw new Error('BENCHMARK_TOKEN is required');
  const identityResponse = await fetch(new URL('/__benchmark/identity', manifest.baseUrl), {
    headers: { 'x-benchmark-token': token }, signal: AbortSignal.timeout(manifest.timeoutMs), redirect: 'error'
  });
  if (!identityResponse.ok) throw new Error('Benchmark identity check failed');
  const identity = await identityResponse.json();
  if (identity.environment !== 'isolated-benchmark' || identity.worker !== config.name
    || identity.fixtureHash !== config.vars.BENCHMARK_FIXTURE_HASH || identity.configHash !== config.vars.BENCHMARK_CONFIG_HASH
    || identity.sourceCommit !== config.vars.BENCHMARK_SOURCE_COMMIT || typeof identity.versionId !== 'string' || !identity.versionId) {
    throw new Error('Benchmark identity or dataset mismatch');
  }
  const runId = randomUUID(), started = performance.now();
  const scenarios = [];
  for (const scenario of manifest.scenarios) {
    const active = new Set(), observations = [];
    let dropped = 0;
    const count = manifest.samplesPerScenario + manifest.warmupPerScenario;
    const start = performance.now();
    for (let index = 0; index < count; index++) {
      const scheduled = start + index * 1000 / manifest.ratePerSecond;
      await sleep(Math.max(0, scheduled - performance.now()));
      const sampleId = randomUUID(), warmup = index < manifest.warmupPerScenario;
      if (active.size >= manifest.maxConcurrency || performance.now() - started > manifest.maxDurationMs) {
        dropped++;
        if (!warmup) observations.push({ sampleId, ok: false, durationMs: performance.now() - scheduled, dropped: true });
        continue;
      }
      const headers = { 'x-benchmark-token': token, 'x-benchmark-run': runId, 'x-benchmark-sample': sampleId,
        'x-benchmark-scenario': scenario.id, 'x-request-id': sampleId };
      if (scenario.authorizationEnv) {
        if (!process.env[scenario.authorizationEnv]) throw new Error('Missing synthetic-user authorization');
        headers.authorization = `Bearer ${process.env[scenario.authorizationEnv]}`;
      }
      const job = (async () => {
        let ok = false, status = null;
        try {
          const response = await fetch(new URL(scenario.path, manifest.baseUrl), {
            method: scenario.method, headers: { ...headers, ...(scenario.body ? { 'content-type': 'application/json' } : {}) },
            body: scenario.body ? JSON.stringify(scenario.body) : undefined,
            signal: AbortSignal.timeout(Math.min(manifest.timeoutMs, Math.max(1, manifest.maxDurationMs - (performance.now() - started)))), redirect: 'error'
          });
          status = response.status;
          const body = await response.json();
          ok = status === scenario.expect.status && validResponse(body, scenario.expect);
        } catch { /* Failed and timed-out attempts remain in the denominator. */ }
        if (!warmup) observations.push({ sampleId, ok, status, durationMs: performance.now() - scheduled });
      })();
      active.add(job); void job.finally(() => active.delete(job));
    }
    await Promise.all(active);
    scenarios.push({ id: scenario.id, workloadHash: hash({ scenario, rate: manifest.ratePerSecond, concurrency: manifest.maxConcurrency }),
      attempts: observations.length, failures: observations.filter((item) => !item.ok).length,
      correct: observations.every((item) => item.ok) && dropped === 0, dropped,
      measurements: { clientDurationMs: observations.map((item) => item.durationMs), workerCpuMs: null, handlerDurationMs: null },
      operations: {}, observations });
  }
  const report = { schemaVersion: 1, environment: 'remote', metadata: {
    runId, commit: identity.sourceCommit, versionId: identity.versionId,
    runtime: manifest.runtime, fixtureHash: identity.fixtureHash, configHash: identity.configHash,
    generatedAt: new Date().toISOString(), manifestHash: hash(manifest)
  }, scenarios, gaps: ['DO internal CPU/storage, Container and asynchronous completions require separate service evidence.',
    'External integrations use configured substitutes; no real third-party end-to-end acceptance.'] };
  if (telemetryPath) attachTelemetry(report, JSON.parse(readFileSync(telemetryPath, 'utf8')));
  else report.gaps.push('Platform CPU/handler telemetry not imported; remote SLO acceptance is insufficient.');
  saveReport(report, outputPath);
  return report;
}

export function attachTelemetry(report, rows) {
  if (!Array.isArray(rows)) throw new Error('Telemetry must be a flat array exported from benchmark_samples');
  for (const scenario of report.scenarios) {
    const selected = scenario.observations.map((observation) => rows.filter((row) => row.sample_id === observation.sampleId
      && row.run_id === report.metadata.runId && row.scenario === scenario.id));
    const complete = selected.every((matches) => matches.length === 1);
    const samples = selected.flat();
    const trustworthy = complete && samples.every((sample, index) => sample.script_name === 'oem-backend-benchmark'
      && sample.version_id === report.metadata.versionId && sample.status === scenario.observations[index].status
      && sample.outcome === 'ok' && typeof sample.cpu_ms === 'number' && Number.isFinite(sample.cpu_ms)
      && sample.cpu_ms >= 0 && sample.cpu_ms <= 60000 && typeof sample.handler_ms === 'number'
      && Number.isFinite(sample.handler_ms) && sample.handler_ms >= 0);
    if (!trustworthy) { report.gaps.push(`Missing, duplicate or invalid platform telemetry for ${scenario.id}`); continue; }
    scenario.measurements.workerCpuMs = samples.map((sample) => sample.cpu_ms);
    scenario.measurements.handlerDurationMs = samples.map((sample) => sample.handler_ms);
    const totals = {};
    for (const sample of samples) {
      const operations = typeof sample.operations === 'string' ? JSON.parse(sample.operations) : sample.operations;
      if (!operations || Object.values(operations).some((value) => !Number.isFinite(value) || value < 0)) throw new Error('Invalid telemetry operations');
      for (const [key, value] of Object.entries(operations)) totals[key] = (totals[key] ?? 0) + value;
      if (operations['background.failed'] > 0) scenario.correct = false;
    }
    scenario.operations = Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value / scenario.attempts]));
  }
}

export function saveReport(report, outputPath) {
  const output = resolve(outputPath);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  writeFileSync(output.replace(/\.json$/, '') + '.md', markdownReport(report));
}
