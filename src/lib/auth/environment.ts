import type { Bindings } from "../../types/app";

// Compare bindings by identity and configuration by value. Keep the snapshot
// private: it includes secrets and must never be logged or used as a cache key.
export function sameAuthEnvironment(snapshot: Bindings, env: Bindings): boolean {
  const keys = Object.keys(snapshot) as Array<keyof Bindings>;
  return keys.length === Object.keys(env).length && keys.every((key) => snapshot[key] === env[key]);
}
