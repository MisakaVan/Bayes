import { createHash } from 'node:crypto';

export const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function quantile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

export function summarize(values) {
  if (!Array.isArray(values) || values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Measurements must be finite, non-negative numbers.');
  }
  return {
    count: values.length,
    mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    p50: quantile(values, 0.5), p95: quantile(values, 0.95), p99: quantile(values, 0.99)
  };
}

export function validateReport(report) {
  if (report.schemaVersion !== 1 || !['local', 'remote'].includes(report.environment)
    || !report.metadata?.fixtureHash || !report.metadata?.configHash || !report.metadata?.runtime
    || !Array.isArray(report.scenarios) || report.scenarios.length === 0) {
    throw new Error('Invalid or incomplete benchmark report.');
  }
  const ids = new Set();
  for (const scenario of report.scenarios) {
    if (!scenario.id || ids.has(scenario.id) || !scenario.workloadHash
      || !Number.isInteger(scenario.attempts) || scenario.attempts < 1
      || !Number.isInteger(scenario.failures) || scenario.failures < 0 || scenario.failures > scenario.attempts
      || !scenario.measurements || !scenario.operations) throw new Error('Invalid benchmark scenario.');
    ids.add(scenario.id);
    for (const values of Object.values(scenario.measurements)) {
      if (values !== null) {
        summarize(values);
        if (values.length !== scenario.attempts) throw new Error('Measurement count differs from attempted operations.');
      }
    }
    for (const value of Object.values(scenario.operations)) {
      if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error('Invalid operation count.');
    }
  }
  return report;
}

// A deterministic bootstrap makes the reported uncertainty reproducible.
// Independent runs should be compared by round rather than by individual requests.
export function ratioInterval(before, after, statistic = 'p95') {
  let state = 20261014;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
  const evaluate = (values) => summarize(values)[statistic];
  const resample = (values) => values.map(() => values[Math.floor(random() * values.length)]);
  const ratios = [];
  for (let index = 0; index < 300; index++) {
    const denominator = evaluate(resample(before));
    if (denominator > 0) ratios.push(evaluate(resample(after)) / denominator);
  }
  return ratios.length ? [quantile(ratios, 0.025), quantile(ratios, 0.975)] : null;
}

export function compareReports(baseline, candidate, policy) {
  validateReport(baseline); validateReport(candidate);
  if (policy.schemaVersion !== 1 || !Array.isArray(policy.rules) || policy.rules.length === 0) {
    throw new Error('A non-empty SLO policy is required.');
  }
  for (const key of ['environment']) {
    if (baseline[key] !== candidate[key]) throw new Error(`Incompatible ${key}.`);
  }
  for (const key of ['fixtureHash', 'configHash', 'runtime']) {
    if (baseline.metadata[key] !== candidate.metadata[key]) throw new Error(`Incompatible ${key}.`);
  }
  const results = [];
  for (const scenario of baseline.scenarios) {
    const next = candidate.scenarios.find((item) => item.id === scenario.id);
    if (!next || next.workloadHash !== scenario.workloadHash) {
      results.push({ scenario: scenario.id, metric: 'workload', status: 'insufficient' }); continue;
    }
    results.push({ scenario: scenario.id, metric: 'correctness',
      status: scenario.failures || next.failures || scenario.correct !== true || next.correct !== true ? 'fail' : 'pass' });
    const rules = policy.rules.filter((rule) => rule.scenario === '*' || rule.scenario === scenario.id);
    if (!rules.length) results.push({ scenario: scenario.id, metric: 'policy', status: 'insufficient' });
    for (const rule of rules) {
      if (!Number.isFinite(rule.maxRatio) || rule.maxRatio <= 0) throw new Error('Invalid SLO ratio.');
      const result = { scenario: scenario.id, metric: rule.metric, status: 'insufficient' };
      if (rule.kind === 'operation') {
        const before = scenario.operations[rule.metric], after = next.operations[rule.metric];
        if (typeof before === 'number' && typeof after === 'number') {
          Object.assign(result, { before, after, status: after <= before * rule.maxRatio ? 'pass' : 'fail' });
        }
      } else if (rule.kind === 'measurement') {
        if (!['mean', 'p50', 'p95', 'p99'].includes(rule.statistic)
          || !Number.isInteger(rule.minSamples) || rule.minSamples < 1) throw new Error('Invalid measurement rule.');
        const before = scenario.measurements[rule.metric], after = next.measurements[rule.metric];
        const roundsAvailable = !rule.minRounds || ((baseline.metadata.rounds ?? 1) >= rule.minRounds
          && (candidate.metadata.rounds ?? 1) >= rule.minRounds);
        if (roundsAvailable && Array.isArray(before) && Array.isArray(after) && before.length >= rule.minSamples && after.length >= rule.minSamples) {
          const beforeUnits = rule.minRounds ? scenario.roundStatistics?.[rule.metric]?.[rule.statistic] : before;
          const afterUnits = rule.minRounds ? next.roundStatistics?.[rule.metric]?.[rule.statistic] : after;
          if (!beforeUnits || !afterUnits || beforeUnits.length < rule.minRounds || afterUnits.length < rule.minRounds) {
            results.push(result); continue;
          }
          const interval = ratioInterval(beforeUnits, afterUnits, rule.minRounds ? 'mean' : rule.statistic);
          const beforeValue = summarize(before)[rule.statistic], afterValue = summarize(after)[rule.statistic];
          const status = beforeValue === 0
            ? (afterValue === 0 ? 'pass' : 'fail')
            : interval?.[0] > rule.maxRatio ? 'fail' : interval?.[1] <= rule.maxRatio ? 'pass' : 'insufficient';
          Object.assign(result, { before: beforeValue, after: afterValue, ratioInterval95: interval, status });
        }
      } else throw new Error('Unknown SLO rule kind.');
      results.push(result);
    }
  }
  if (candidate.scenarios.some((scenario) => !baseline.scenarios.some((item) => item.id === scenario.id))) {
    results.push({ scenario: '*', metric: 'extra-scenarios', status: 'insufficient' });
  }
  return { schemaVersion: 1, status: results.some((item) => item.status === 'fail') ? 'fail'
    : results.some((item) => item.status === 'insufficient') ? 'insufficient' : 'pass', results };
}

export function aggregateReports(reports) {
  if (reports.length < 2) throw new Error('At least two independent runs are required');
  reports.forEach(validateReport);
  const first = reports[0], ids = new Set();
  if (first.environment !== 'remote') throw new Error('Only independent remote runs can be aggregated');
  for (const report of reports) {
    if (!report.metadata.runId || ids.has(report.metadata.runId)) throw new Error('Duplicate or missing run ID');
    ids.add(report.metadata.runId);
    if (report.environment !== first.environment || ['fixtureHash', 'configHash', 'runtime', 'commit', 'versionId'].some((key) => report.metadata[key] !== first.metadata[key])) throw new Error('Incompatible remote rounds');
    if (report.scenarios.length !== first.scenarios.length) throw new Error('Incompatible scenario set');
  }
  const scenarios = first.scenarios.map((scenario) => {
    const rounds = reports.map((report) => report.scenarios.find((item) => item.id === scenario.id));
    if (rounds.some((round) => !round || round.workloadHash !== scenario.workloadHash)) throw new Error('Incompatible round workload');
    const keys = Object.keys(scenario.measurements);
    const measurements = {}, roundStatistics = {};
    for (const key of keys) {
      const available = rounds.every((round) => Array.isArray(round.measurements[key]));
      measurements[key] = available ? rounds.flatMap((round) => round.measurements[key]) : null;
      if (available) roundStatistics[key] = Object.fromEntries(['mean','p50','p95','p99'].map((stat) => [stat,
        rounds.map((round) => summarize(round.measurements[key])[stat])]));
    }
    const attempts = rounds.reduce((sum, round) => sum + round.attempts, 0);
    const operationKeys = new Set(rounds.flatMap((round) => Object.keys(round.operations)));
    const operations = Object.fromEntries([...operationKeys].map((key) => [key,
      rounds.every((round) => typeof round.operations[key] === 'number')
        ? rounds.reduce((sum, round) => sum + round.operations[key] * round.attempts, 0) / attempts : null]));
    return { id: scenario.id, workloadHash: scenario.workloadHash, attempts,
      failures: rounds.reduce((sum, round) => sum + round.failures, 0), correct: rounds.every((round) => round.correct === true),
      measurements, roundStatistics, operations };
  });
  return { schemaVersion: 1, environment: 'remote', metadata: { ...first.metadata, runId: [...ids].join(','),
    rounds: reports.length }, scenarios, gaps: [...new Set(reports.flatMap((report) => report.gaps ?? []))] };
}

export function markdownReport(report) {
  validateReport(report);
  const lines = [
    '# Benchmark evidence', '', `Environment: ${report.environment}; commit: ${report.metadata.commit}; runtime: ${report.metadata.runtime}.`,
    '', 'Local duration is not Cloudflare CPU. Missing measurements are not zero. Operation counts are application operations, not invoices.', '',
    '| Scenario | Attempts / failures | Duration p50 / p95 ms | Worker CPU p95 ms | Operations per attempt | Correct |',
    '| --- | --- | --- | --- | --- | --- |'
  ];
  for (const scenario of report.scenarios) {
    const duration = summarize(scenario.measurements.localDurationMs ?? scenario.measurements.clientDurationMs ?? []);
    const cpu = scenario.measurements.workerCpuMs === null || !scenario.measurements.workerCpuMs ? null : summarize(scenario.measurements.workerCpuMs);
    const format = (value) => value === null ? 'unavailable' : value.toFixed(3);
    lines.push(`| ${scenario.id} | ${scenario.attempts} / ${scenario.failures} | ${format(duration.p50)} / ${format(duration.p95)} | ${format(cpu?.p95 ?? null)} | ${Object.entries(scenario.operations).map(([key, value]) => `${key}=${value ?? 'unavailable'}`).join(', ')} | ${scenario.correct === true} |`);
  }
  lines.push('', 'Coverage gaps:', '', ...(report.gaps ?? []).map((gap) => `- ${gap}`), '');
  return lines.join('\n');
}
