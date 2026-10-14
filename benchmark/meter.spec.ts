import { describe, expect, it } from "vitest";
import { SqliteD1 } from "../src/test/sqliteD1";
import type { Bindings } from "../src/types/app";
import { Meter, observeBindings } from "./meter";

describe("benchmark binding meter", () => {
  it("preserves statement binding, native batch objects and actual results", async () => {
    const database = new SqliteD1();
    database.sqlite.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)");
    const empty = {};
    const env = { DB: database.db, UGC_BUCKET: empty, OEM_KV: empty,
      OEM_MODERATION_Q: empty, OEM_TRANSLATION_Q: empty, OEM_WEBHOOK_Q: empty,
      OEM_USER_DO: empty, OEM_STATS_DO: empty, OEM_NOTIFICATION_DO: empty, OEM_IMG_TRANS: empty,
      OEM_PUBLIC_RATE_LIMIT: empty, OEM_AUTH_RATE_LIMIT: empty, OEM_BINDING_RATE_LIMIT: empty } as unknown as Bindings;
    const meter = new Meter(), observed = observeBindings(env, meter);
    try {
      await observed.DB.batch([observed.DB.prepare("INSERT INTO test VALUES (?1, ?2)").bind(1, "first"),
        observed.DB.prepare("INSERT INTO test VALUES (?1, ?2)").bind(2, "second")]);
      const result = await observed.DB.prepare("SELECT * FROM test ORDER BY id").all();
      expect(result.results).toEqual([{ id: 1, value: "first" }, { id: 2, value: "second" }]);
      expect(database.queries).toHaveLength(3);
      expect(meter.operations).toMatchObject({ "d1.batch": 1, "d1.query": 3 });
    } finally { database.sqlite.close(); }
  });
});
