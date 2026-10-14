import logger from "../oem-logger/src/index";

type Env = { OEM_ERR: D1Database; BENCHMARK_METRICS: D1Database };
export function redactErrorEvent(event: TraceItem): TraceItem {
  // Production logger stores full Trace payloads. The benchmark token and test
  // bearer headers must never enter that payload, even on a failed invocation.
  const fetch = event.event && "request" in event.event ? event.event : null;
  const request: TraceItemFetchEventInfoRequest | null = fetch ? {
    url: "https://benchmark.invalid/", method: fetch.request.method, headers: {},
    getUnredacted() { return this; }
  } : null;
  return {
    event: fetch && request ? { request, response: fetch.response ? { status: fetch.response.status } : undefined } : null,
    eventTimestamp: event.eventTimestamp, scriptName: event.scriptName, outcome: event.outcome,
    executionModel: event.executionModel, truncated: event.truncated, cpuTime: event.cpuTime, wallTime: event.wallTime,
    logs: event.logs.map((log) => ({ timestamp: log.timestamp, level: log.level, message: ["benchmark details redacted"] })),
    exceptions: event.exceptions.map((exception) => ({ timestamp: exception.timestamp, name: "Error", message: "benchmark exception; details redacted" })),
    diagnosticsChannelEvents: []
  };
}
export default {
  async tail(events: TraceItem[], env: Env, ctx: ExecutionContext): Promise<void> {
    logger.tail(events.map(redactErrorEvent), env, ctx);
    const statements: D1PreparedStatement[] = [];
    for (const event of events) {
      for (const log of event.logs) {
        if (log.message[0] !== "benchmark.sample") continue;
        const sample = log.message[1] as Record<string, unknown> | undefined;
        if (!sample || typeof sample.runId !== "string" || typeof sample.sampleId !== "string"
          || typeof sample.scenario !== "string") continue;
        const cpu = Number.isFinite(event.cpuTime) && event.cpuTime >= 0 ? event.cpuTime : null;
        statements.push(env.BENCHMARK_METRICS.prepare(`INSERT OR REPLACE INTO benchmark_samples
          (sample_id, run_id, scenario, script_name, version_id, status, outcome, cpu_ms, handler_ms, completion_ms, operations, dependency_ms, recorded_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(sample.sampleId, sample.runId, sample.scenario, event.scriptName ?? "unknown", event.scriptVersion?.id ?? null, sample.status ?? null,
            event.outcome, cpu, sample.handlerDurationMs ?? null, sample.completionDurationMs ?? null,
            JSON.stringify(sample.operations ?? {}), JSON.stringify(sample.dependencyMs ?? {}), Date.now()));
      }
    }
    // The collector runs only in the benchmark environment. Its own cost is not
    // attributed to the measured Worker and is included in the resource budget.
    for (let index = 0; index < statements.length; index += 50) await env.BENCHMARK_METRICS.batch(statements.slice(index, index + 50));
  },
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await env.BENCHMARK_METRICS.prepare("DELETE FROM benchmark_samples WHERE recorded_at < ?")
      .bind(Date.now() - 7 * 24 * 60 * 60 * 1000).run();
  }
};
