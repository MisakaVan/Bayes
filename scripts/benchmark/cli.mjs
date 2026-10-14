import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareReports, markdownReport, aggregateReports } from './report.mjs';
import { buildFixture } from './fixtures.mjs';
import { benchmarkMigrations } from './schema.mjs';
import { assertIsolation, configFingerprint } from './isolation.mjs';
import { runRemote, attachTelemetry, saveReport } from './remote.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
process.chdir(root);
const [command, ...args] = process.argv.slice(2);
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
try {
  if (command === 'local') {
    const output = resolve(args[0] ?? 'benchmark/results/local.json');
    execFileSync('pnpm', ['exec', 'vitest', 'run', 'benchmark/local.spec.ts'], {
      stdio: 'inherit', env: { ...process.env, BENCH_OUTPUT: output }
    });
    process.stdout.write(`${output}\n`);
  } else if (command === 'compare' || command === 'slo') {
    if (args.length < 2) throw new Error('Usage: bench:compare baseline.json candidate.json [policy.json]');
    const baseline = read(args[0]), candidate = read(args[1]);
    const policy = read(args[2] ?? `benchmark/slo.${candidate.environment}.json`);
    const comparison = compareReports(baseline, candidate, policy);
    process.stdout.write(JSON.stringify(comparison, null, 2) + '\n');
    process.exitCode = comparison.status === 'pass' ? 0 : comparison.status === 'fail' ? 1 : 2;
  } else if (command === 'remote') {
    if (!args[0]) throw new Error('Usage: bench:remote manifest.json [output.json]');
    const report = await runRemote(args[0], args[1] ?? 'benchmark/results/remote.json');
    process.stdout.write(`Run ${report.metadata.runId}; failures ${report.scenarios.reduce((sum, item) => sum + item.failures, 0)}\n`);
    process.exitCode = report.scenarios.some((item) => !item.correct) ? 1 : 0;
  } else if (command === 'plan') {
    const manifest = read(args[0] ?? 'benchmark/remote.example.json');
    const attempts = manifest.scenarios.length * (manifest.samplesPerScenario + manifest.warmupPerScenario);
    const markerReads = manifest.scenarios.reduce((sum, scenario) => {
      const url = new URL(scenario.path, 'https://benchmark.invalid');
      const ids = (url.searchParams.get('markerIds') ?? url.searchParams.get('markerId') ?? '').split(',').filter(Boolean);
      return sum + new Set(ids).size * (manifest.samplesPerScenario + manifest.warmupPerScenario);
    }, 0);
    process.stdout.write(JSON.stringify({ provisioning: 'not performed', measurement: 'estimate only',
      workerHttpAttempts: attempts + 1, markerCacheBoundaryCallsUpperBound: markerReads,
      coldKvGetsUpperBound: markerReads, coldOriginSqlCallsUpperBound: markerReads, coldKvPutsUpperBound: markerReads,
      benchmarkMetricRowsUpperBound: attempts, durationUpperBoundMs: manifest.maxDurationMs,
      parallelRequestsUpperBound: manifest.maxConcurrency,
      gaps: ['D1 rows_read depends on fixture/query plan.', 'Cron, Queue, DO, logger and storage usage are additional.',
        'No Container transformations or real third-party calls in this starter manifest.',
        'Dollar estimate needs current pricing and remaining included account quotas.',
        '20 samples per scenario is a feasibility run, not p95 SLO acceptance.'] }, null, 2) + '\n');
  } else if (command === 'telemetry') {
    if (args.length !== 3) throw new Error('Usage: telemetry report.json flat-telemetry.json output.json');
    const report = read(args[0]); attachTelemetry(report, read(args[1])); saveReport(report, args[2]);
  } else if (command === 'aggregate') {
    if (args.length < 3) throw new Error('Usage: aggregate output.json run1.json run2.json [...]');
    saveReport(aggregateReports(args.slice(1).map(read)), args[0]);
  } else if (command === 'isolation') {
    assertIsolation(args[0] ?? 'wrangler.benchmark.json');
    process.stdout.write('Benchmark resource isolation checks passed.\n');
  } else if (command === 'prepare') {
    if (args.length !== 2) throw new Error('Usage: prepare provisioned-config.json fixture-profile.json');
    const config = read(args[0]), fixture = buildFixture(read(args[1]));
    if (execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', 'src', 'benchmark', 'scripts/benchmark'], { encoding: 'utf8' }).trim()) {
      throw new Error('Commit benchmark/application sources before recording a deployable source revision.');
    }
    config.vars.BENCHMARK_FIXTURE_HASH = fixture.hash;
    config.vars.BENCHMARK_SOURCE_COMMIT = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    config.vars.BENCHMARK_CONFIG_HASH = configFingerprint(config);
    writeFileSync(args[0], JSON.stringify(config, null, 2) + '\n');
    process.stdout.write('Fixture, configuration and source revision recorded.\n');
  } else if (command === 'bootstrap') {
    if (!args[0]) throw new Error('Usage: bootstrap output.sql');
    writeFileSync(args[0], benchmarkMigrations().map((item) => `-- ${item.name}\n${item.sql}`).join('\n'));
    process.stdout.write('Fresh benchmark bootstrap written; legacy ef_pass drop explicitly omitted.\n');
  } else if (command === 'report') {
    process.stdout.write(markdownReport(read(args[0])));
  } else if (command === 'fixture') {
    if (!args[0]) throw new Error('Usage: fixture output.sql [profile.json]');
    const fixture = buildFixture(args[1] ? read(args[1]) : undefined);
    mkdirSync(dirname(resolve(args[0])), { recursive: true });
    writeFileSync(args[0], fixture.sql + '\n');
    process.stdout.write(JSON.stringify({ hash: fixture.hash, comments: fixture.comments, votes: fixture.votes }) + '\n');
  } else throw new Error('Commands: local, remote, compare, slo, report, fixture, bootstrap, isolation, telemetry');
} catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
