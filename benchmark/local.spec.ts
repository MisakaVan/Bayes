import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { describe, it, expect, vi } from "vitest";
import { SqliteD1 } from "../src/test/sqliteD1";
import { buildFixture, defaultProfile } from "../scripts/benchmark/fixtures.mjs";
import { hash, markdownReport } from "../scripts/benchmark/report.mjs";
import { benchmarkMigrations } from "../scripts/benchmark/schema.mjs";

vi.mock("cloudflare:workers", () => ({ exports: {} }));
import { listCachedPublicCommentsByMarker } from "../src/services/upload/listPublicComments";
import { encodeBase64, decodeBase64, diffOneBitBitmaps } from "../src/services/progress/bitmap";

const enabled = process.env.BENCH_OUTPUT !== undefined;
describe.skipIf(!enabled)("repeatable local cost baseline", () => {
  it("records real SQL/cache calls and checks complete output equality", async () => {
    const iterations = Number(process.env.BENCH_ITERATIONS ?? 10);
    if (!Number.isInteger(iterations) || iterations < 3 || iterations > 1000) throw new Error("Invalid iterations.");
    const fixture = buildFixture(defaultProfile);
    const db = new SqliteD1();
    const migrations = benchmarkMigrations();
    for (const migration of migrations) db.sqlite.exec(migration.sql);
    db.sqlite.exec(fixture.sql);
    const scenarios: Array<Record<string, unknown>> = [];
    const totals = { "d1.query": 0, "kv.get": 0, "kv.put": 0 };
    const values = new Map<string, string>();
    const kv = {
      get: async (key: string) => { totals["kv.get"]++; return values.get(key) ?? null; },
      put: async (key: string, value: string) => { totals["kv.put"]++; values.set(key, value); }
    } as unknown as KVNamespace;
    const run = async (markerIds: string[], split: boolean) => {
      const jobs: Promise<unknown>[] = [];
      const read = (ids: string[]) => listCachedPublicCommentsByMarker({
        db: db.db, kv, markerIds: ids, limit: 6, replyLimit: 3, cacheNamespace: "prod",
        waitUntil: (promise) => jobs.push(promise)
      });
      const items = split ? (await Promise.all(markerIds.map((id) => read([id])))).flat() : await read(markerIds);
      await Promise.all(jobs);
      return items;
    };
    try {
      for (const size of [1, 10, 50, 100]) {
        const markerIds = fixture.markerIds.slice(0, size);
        values.clear();
        const expected = await run(markerIds, false);
        expect(expected).toHaveLength(size * 6);
        const expectedHash = hash(expected);
        for (const state of ["cold", "kv-warm", "mixed"] as const) {
          for (const split of [false, true]) {
            const durations: number[] = [], operations = { "d1.query": 0, "kv.get": 0, "kv.put": 0 };
            for (let index = -2; index < iterations; index++) {
              values.clear();
              if (state !== "cold") await run(state === "mixed" ? markerIds.filter((_, i) => i % 2 === 0) : markerIds, false);
              db.queries.length = 0;
              totals["kv.get"] = 0; totals["kv.put"] = 0;
              const start = performance.now();
              const items = await run(markerIds, split);
              const duration = performance.now() - start;
              expect(hash(items)).toBe(expectedHash);
              if (index >= 0) {
                durations.push(duration);
                operations["d1.query"] += db.queries.length;
                operations["kv.get"] += totals["kv.get"]; operations["kv.put"] += totals["kv.put"];
              }
            }
            for (const key of Object.keys(operations) as Array<keyof typeof operations>) operations[key] /= iterations;
            const expectedQueries = state === "kv-warm" ? 0 : split ? (state === "mixed" ? Math.floor(size / 2) : size)
              : (state === "mixed" && size === 1 ? 0 : 1);
            expect(operations["d1.query"]).toBe(expectedQueries);
            scenarios.push({ id: `comments/${size}/${state}/${split ? "per-marker-origin" : "batch-origin"}`,
              workloadHash: hash({ markerIds, state, split, limit: 6, replyLimit: 3 }),
              attempts: iterations, failures: 0, correct: true, outputHash: expectedHash,
              measurements: { localDurationMs: durations, workerCpuMs: null, handlerDurationMs: null }, operations });
          }
        }
      }
      for (const pointCount of [1000, 10000, 100000]) {
        const bytes = new Uint8Array(Math.ceil(pointCount / 8));
        for (let index = 0; index < bytes.length; index++) bytes[index] = index % 256;
        const encoded = encodeBase64(bytes);
        const durations: number[] = [];
        for (let index = -2; index < iterations; index++) {
          const start = performance.now();
          const decoded = decodeBase64(encodeBase64(bytes));
          const diff = diffOneBitBitmaps(bytes, decoded, pointCount);
          const duration = performance.now() - start;
          expect(decoded).toEqual(bytes); expect(diff).toEqual({ increments: [], decrements: [] });
          if (index >= 0) durations.push(duration);
        }
        scenarios.push({ id: `progress/bitmap/${pointCount}`, workloadHash: hash({ pointCount, encoded }),
          attempts: iterations, failures: 0, correct: true,
          measurements: { localDurationMs: durations, workerCpuMs: null, handlerDurationMs: null },
          operations: { "d1.query": 0, "kv.get": 0, "kv.put": 0 } });
      }
      const report = { schemaVersion: 1, environment: "local", metadata: {
        commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
        runtime: process.version, fixtureHash: fixture.hash, configHash: hash({ migrations, profile: fixture.profile }),
        generatedAt: new Date().toISOString(), fixture: { comments: fixture.comments, votes: fixture.votes, profile: fixture.profile },
        iterations, warmup: 2, timing: "includes response construction and asynchronous KV writes"
      }, scenarios, gaps: [
        "Cloudflare Worker CPU, D1 rows_read and remote latency are unavailable locally.",
        "Cache origin scenarios do not measure WorkerEntrypoint response-cache hits or internal fetch billing.",
        "Synthetic default profile is not yet fitted to current production distributions.",
        "Auth, DO, Queue, Cron, Container, Redis and third-party end-to-end benchmarks require isolated resources."
      ] };
      const output = resolve(process.env.BENCH_OUTPUT!);
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
      writeFileSync(output.replace(/\.json$/, "") + ".md", markdownReport(report));
    } finally { db.sqlite.close(); }
  }, 120_000);
});
