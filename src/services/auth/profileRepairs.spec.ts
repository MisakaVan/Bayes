import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthDatabase } from "../../test/authDatabase";
import { getAuthConsistency, repairProfiles, runProfileRecovery } from "./profileRepairs";
import type { Bindings } from "../../types/app";

describe("profile repair", () => {
  let database: ReturnType<typeof createAuthDatabase>;
  const now = Date.parse("2026-10-13T00:00:00Z");
  beforeEach(() => {
    database = createAuthDatabase();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { database.sqlite.close(); vi.restoreAllMocks(); });

  function addUser(id: string, verified = 1, createdAt = "2026-05-01T01:02:03Z") {
    database.sqlite.prepare("INSERT INTO auth_users (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, "Provider Name", `${id}@example.test`, verified, createdAt, createdAt);
  }
  function count(table: string) { return Number(database.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n); }

  it("previews by default without allocating, and preserves provider names and historical dates on apply", async () => {
    addUser("old");
    database.sqlite.prepare("INSERT INTO auth_sessions (id, token, userId, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)")
      .run("session", "test-only", "old", "2027-01-01", "2026-05-02T03:04:05Z", "2026-05-02T03:04:05Z");
    expect((await repairProfiles(database.db, { now })).results).toEqual([{ uid: "old", status: "would_create" }]);
    expect(count("users")).toBe(0);
    expect(count("user_uid_sequence")).toBe(0);
    const repaired = await repairProfiles(database.db, { dryRun: false, now });
    expect(repaired.results[0]).toMatchObject({ uid: "old", status: "created" });
    const row = database.sqlite.prepare("SELECT * FROM users WHERE uid='old'").get()!;
    expect(row).toMatchObject({ uid_number: 100001, nickname: "ProviderName", nickname_customized: 0,
      created_at: "2026-05-01 01:02:03", last_active: "2026-05-02 03:04:05", email_verified: "true", role: "n", points: 0, progress_marker: "" });
    expect((await repairProfiles(database.db, { dryRun: false, now })).results).toEqual([]);
    expect(database.sqlite.prepare("SELECT * FROM users WHERE uid='old'").get()).toEqual(row);
    expect(count("user_uid_sequence")).toBe(1);
  });

  it("skips unverified and recent identities and reports cross-UUID conflicts without changing them", async () => {
    addUser("pending", 0);
    addUser("recent", 1, new Date(now - 60_000).toISOString());
    addUser("conflict");
    database.sqlite.exec("INSERT INTO users (uid,email,password_hash,nickname,uid_number) VALUES ('different','conflict@example.test','managed','Existing',100017); INSERT INTO user_uid_sequence (id) VALUES (17)");
    expect((await repairProfiles(database.db, { dryRun: false, now })).results)
      .toEqual([{ uid: "conflict", status: "conflict", code: "PROFILE_IDENTITY_CONFLICT" }]);
    expect(count("users")).toBe(1);
    expect(count("user_uid_sequence")).toBe(1);
    expect(await getAuthConsistency(database.db)).toMatchObject({ authUsers: 3, businessUsers: 1,
      verifiedMissingProfiles: 2, unverifiedMissingProfiles: 1, numericGaps: 16, allocationHighWater: 17 });
  });

  it("paginates past failed accounts and preserves allocation after a batch failure", async () => {
    for (const id of ["a", "b", "c"]) addUser(id);
    database.sqlite.exec("CREATE TRIGGER reject_a BEFORE INSERT ON users WHEN NEW.uid='a' BEGIN SELECT RAISE(ABORT, 'storage failed'); END");
    const first = await repairProfiles(database.db, { dryRun: false, limit: 2, now });
    expect(first.results.map((result) => result.status)).toEqual(["failed", "created"]);
    expect(first.nextCursor?.id).toBe("b");
    const second = await repairProfiles(database.db, { dryRun: false, limit: 2, cursor: first.nextCursor!, now });
    expect(second.results[0]).toMatchObject({ uid: "c", status: "created" });
    expect(second.nextCursor).toBeNull();
    expect(count("user_uid_sequence")).toBe(2);
    expect(database.sqlite.prepare("SELECT uid_number FROM users ORDER BY uid_number").all()).toEqual([{ uid_number: 100001 }, { uid_number: 100002 }]);
  });

  it("is disabled by default, honors the scheduled lock, and advances and resets its recovery cursor", async () => {
    const values = new Map<string, string>();
    const kv = { get: vi.fn(async (key: string) => values.has(key) ? JSON.parse(values.get(key)!) : null),
      put: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
      delete: vi.fn(async (key: string) => { values.delete(key); }) };
    const env = { DB: database.db, OEM_KV: kv } as unknown as Bindings;
    for (let index = 0; index < 21; index++) addUser(`user-${String(index).padStart(2, "0")}`);
    await runProfileRecovery(env, now);
    expect(count("users")).toBe(0);
    env.AUTH_PROFILE_REPAIR_ENABLED = "1";
    env.LOCK_SCHEDULED_JOBS = "1";
    await runProfileRecovery(env, now);
    expect(count("users")).toBe(0);
    env.LOCK_SCHEDULED_JOBS = "0";
    await runProfileRecovery(env, now);
    expect(count("users")).toBe(20);
    expect(kv.put).toHaveBeenCalledOnce();
    await runProfileRecovery(env, now + 5 * 60_000);
    expect(count("users")).toBe(21);
    expect(values.size).toBe(0);
  });
});
