import { AsyncLocalStorage } from "node:async_hooks";
import worker from "../src/index";
import type { Bindings } from "../src/types/app";
import { Meter, observeBindings } from "./meter";
export { PublicReadCache, OEMUserDO, OEMStatsDO, OEMNotificationDO, oem_imgTrans } from "../src/index";

type BenchmarkEnv = Bindings & {
  BENCHMARK_ENVIRONMENT: string;
  BENCHMARK_TOKEN: string;
  BENCHMARK_FIXTURE_HASH: string;
  BENCHMARK_CONFIG_HASH: string;
  BENCHMARK_SOURCE_COMMIT: string;
  BENCHMARK_VERSION: WorkerVersionMetadata;
  BENCHMARK_UPSTREAM: Fetcher;
};
function testBindings(env: BenchmarkEnv, meter: Meter): Bindings {
  const observed = observeBindings(env, meter);
  observed.OEM_ID_MAILS = {
    send: async () => {
      const response = await meter.measure("email.send.mock", () => env.BENCHMARK_UPSTREAM.fetch("https://benchmark-email.invalid/send", { method: "POST" }));
      if (!response.ok) throw new Error("Benchmark Email substitute is not configured.");
      return { messageId: "benchmark-mock-email" };
    }
  } as SendEmail;
  return observed;
}
const scope = new AsyncLocalStorage<{ env: BenchmarkEnv; meter: Meter }>();
const nativeFetch = globalThis.fetch;
// Only this isolated entrypoint changes egress. Unknown/background egress fails
// closed; production imports src/index directly and never loads this module.
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const context = scope.getStore();
  if (!context) throw new Error("Unscoped benchmark egress is not allowed.");
  const request = new Request(input, init);
  const origin = new URL(request.url).origin;
  const redisOrigin = new URL(context.env.UPSTASH_REDIS_REST_URL).origin;
  if (origin === redisOrigin) return context.meter.measure("redis.http", async () => {
    const commands: unknown = request.method === "POST" ? await request.clone().json().catch(() => null) : null;
    context.meter.add("redis.commands", Array.isArray(commands) && Array.isArray(commands[0]) ? commands.length : 1);
    return nativeFetch(request);
  });
  return context.meter.measure("external.http.mock", () => context.env.BENCHMARK_UPSTREAM.fetch(request));
}) as typeof fetch;

function authorized(request: Request, env: BenchmarkEnv): boolean {
  return env.BENCHMARK_ENVIRONMENT === "isolated-benchmark"
    && Boolean(env.BENCHMARK_TOKEN) && request.headers.get("x-benchmark-token") === env.BENCHMARK_TOKEN;
}

export default {
  async fetch(request: Request, env: BenchmarkEnv, ctx: ExecutionContext): Promise<Response> {
    if (!authorized(request, env)) return new Response("Forbidden", { status: 403 });
    const url = new URL(request.url);
    if (url.pathname === "/__benchmark/identity") return Response.json({
      environment: env.BENCHMARK_ENVIRONMENT, worker: "oem-backend-benchmark",
      fixtureHash: env.BENCHMARK_FIXTURE_HASH, configHash: env.BENCHMARK_CONFIG_HASH,
      sourceCommit: env.BENCHMARK_SOURCE_COMMIT, versionId: env.BENCHMARK_VERSION.id
    });
    const runId = request.headers.get("x-benchmark-run") ?? "manual";
    const sampleId = request.headers.get("x-benchmark-sample") ?? crypto.randomUUID();
    const scenario = request.headers.get("x-benchmark-scenario") ?? "manual";
    if (![runId, sampleId, scenario].every((value) => /^[a-zA-Z0-9_./-]{1,160}$/.test(value))) return new Response("Invalid benchmark labels", { status: 400 });
    const meter = new Meter();
    const started = performance.now();
    const jobs: Promise<unknown>[] = [];
    const context: ExecutionContext = {
      waitUntil: (job) => { jobs.push(job); ctx.waitUntil(job); },
      passThroughOnException: () => ctx.passThroughOnException(),
      props: ctx.props,
      exports: ctx.exports,
      tracing: ctx.tracing
    };
    return scope.run({ env, meter }, async () => {
      let status = 500;
      try {
        const response = await worker.fetch(request, testBindings(env, meter), context);
        status = response.status;
        return response;
      } finally {
        const handlerDurationMs = performance.now() - started;
        ctx.waitUntil((async () => {
          let index = 0;
          while (index < jobs.length) {
            const batch = jobs.slice(index); index = jobs.length;
            const outcomes = await Promise.allSettled(batch);
            meter.add("background.failed", outcomes.filter((outcome) => outcome.status === "rejected").length);
          }
          console.warn("benchmark.sample", { runId, sampleId, scenario, status, handlerDurationMs,
            completionDurationMs: performance.now() - started, operations: meter.operations, dependencyMs: meter.dependencyMs });
        })());
      }
    });
  },
  async scheduled(event: ScheduledEvent, env: BenchmarkEnv, ctx: ExecutionContext) {
    const meter = new Meter(), jobs: Promise<unknown>[] = [], start = performance.now();
    const context: ExecutionContext = { ...ctx, props: ctx.props, exports: ctx.exports, tracing: ctx.tracing,
      passThroughOnException: () => ctx.passThroughOnException(),
      waitUntil: (job) => { jobs.push(job); ctx.waitUntil(job); } };
    await scope.run({ env, meter }, () => worker.scheduled(event, testBindings(env, meter), context));
    const handlerDurationMs = performance.now() - start;
    ctx.waitUntil(Promise.allSettled(jobs).then((outcomes) => {
      meter.add("background.failed", outcomes.filter((outcome) => outcome.status === "rejected").length);
      console.warn("benchmark.sample", { runId: "maintenance", sampleId: crypto.randomUUID(), scenario: "scheduled",
        status: 200, handlerDurationMs, completionDurationMs: performance.now() - start,
        operations: meter.operations, dependencyMs: meter.dependencyMs });
    }));
  },
  async queue(batch: Parameters<typeof worker.queue>[0], env: BenchmarkEnv) {
    // Isolated Queue names retain their own consumer while the production handler
    // expects its three canonical queue names.
    const names: Record<string, string> = { "oem-benchmark-moderation": "oem-moderation",
      "oem-benchmark-translation": "oem-translation", "oem-benchmark-webhook": "oem-webhook" };
    if (!names[batch.queue]) throw new Error("Unknown benchmark queue");
    const meter = new Meter(), start = performance.now();
    try {
      const canonicalBatch = new Proxy(batch, { get(target, key) {
        if (key === "queue") return names[target.queue]!;
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      } });
      await scope.run({ env, meter }, () => worker.queue(canonicalBatch, testBindings(env, meter)));
    } finally {
      console.warn("benchmark.sample", { runId: "queue", sampleId: crypto.randomUUID(), scenario: batch.queue,
        status: 200, handlerDurationMs: performance.now() - start, operations: meter.operations, dependencyMs: meter.dependencyMs });
    }
  }
};
