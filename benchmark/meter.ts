import type { Bindings } from "../src/types/app";

export class Meter {
  readonly operations: Record<string, number> = {};
  readonly dependencyMs: Record<string, number> = {};
  add(key: string, amount = 1) { this.operations[key] = (this.operations[key] ?? 0) + amount; }
  async measure<T>(key: string, run: () => Promise<T>): Promise<T> {
    this.add(key);
    const started = performance.now();
    try { return await run(); }
    finally { this.dependencyMs[key] = (this.dependencyMs[key] ?? 0) + performance.now() - started; }
  }
}

export function observeBindings(env: Bindings, meter: Meter): Bindings {
  const raw = new WeakMap<object, D1PreparedStatement>();
  const metadata = (result: D1Result<unknown>) => {
    if (typeof result.meta?.rows_read === "number") meter.add("d1.rows_read", result.meta.rows_read);
    if (typeof result.meta?.rows_written === "number") meter.add("d1.rows_written", result.meta.rows_written);
  };
  const wrapStatement = (statement: D1PreparedStatement): D1PreparedStatement => {
    const wrapped = new Proxy(statement, {
      get(target, property) {
        if (property === "bind") return (...values: unknown[]) => wrapStatement(target.bind(...values));
        if (["first", "all", "run", "raw"].includes(String(property))) return (...args: unknown[]) => meter.measure("d1.query", async () => {
          const result = await Reflect.apply(Reflect.get(target, property), target, args);
          if (property === "all" || property === "run") metadata(result as D1Result<unknown>);
          else meter.add("d1.metadata_unavailable");
          return result;
        });
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    raw.set(wrapped, statement); return wrapped;
  };
  const db = new Proxy(env.DB, {
    get(target, property) {
      if (property === "prepare") return (sql: string) => wrapStatement(target.prepare(sql));
      if (property === "batch") return (statements: D1PreparedStatement[]) => meter.measure("d1.batch", async () => {
        meter.add("d1.query", statements.length);
        const results = await target.batch(statements.map((statement) => raw.get(statement) ?? statement));
        results.forEach(metadata); return results;
      });
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  const wrap = <T extends object>(target: T, prefix: string, methods: string[]): T => new Proxy(target, {
    get(object, property) {
      const value = Reflect.get(object, property);
      if (typeof value !== "function") return value;
      return methods.includes(String(property))
        ? (...args: unknown[]) => meter.measure(`${prefix}.${String(property)}`, () => Reflect.apply(value, object, args))
        : value.bind(object);
    }
  });
  const observed = { ...env, DB: db, UGC_BUCKET: wrap(env.UGC_BUCKET, "r2", ["get", "head", "put", "delete", "list"]) };
  if (env.OEM_KV) observed.OEM_KV = wrap(env.OEM_KV, "kv", ["get", "getWithMetadata", "put", "delete", "list"]);
  observed.OEM_MODERATION_Q = wrap(env.OEM_MODERATION_Q, "queue.OEM_MODERATION_Q", ["send", "sendBatch"]);
  observed.OEM_TRANSLATION_Q = wrap(env.OEM_TRANSLATION_Q, "queue.OEM_TRANSLATION_Q", ["send", "sendBatch"]);
  observed.OEM_WEBHOOK_Q = wrap(env.OEM_WEBHOOK_Q, "queue.OEM_WEBHOOK_Q", ["send", "sendBatch"]);
  for (const key of ["OEM_PUBLIC_RATE_LIMIT", "OEM_AUTH_RATE_LIMIT", "OEM_BINDING_RATE_LIMIT"] as const) {
    observed[key] = wrap(env[key], `ratelimit.${key}`, ["limit"]);
  }
  const namespace = <T extends object>(targetNamespace: T, key: string): T => new Proxy(targetNamespace, {
      get(target, property) {
        const value = Reflect.get(target, property);
        if (typeof value === "function" && (property === "get" || property === "getByName")) return (...args: unknown[]) =>
          wrap(Reflect.apply(value, target, args) as object, `do.${key}`, ["fetch"]);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
  observed.OEM_USER_DO = namespace(env.OEM_USER_DO, "OEM_USER_DO");
  observed.OEM_STATS_DO = namespace(env.OEM_STATS_DO, "OEM_STATS_DO");
  observed.OEM_NOTIFICATION_DO = namespace(env.OEM_NOTIFICATION_DO, "OEM_NOTIFICATION_DO");
  observed.OEM_IMG_TRANS = namespace(env.OEM_IMG_TRANS, "OEM_IMG_TRANS");
  return observed;
}
