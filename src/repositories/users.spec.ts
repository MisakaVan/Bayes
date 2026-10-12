import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteD1 } from "../test/sqliteD1";
import { ensureUserProfile, getUserByPublicUid } from "./users";

describe("profile activity write throttling", () => {
  let database: SqliteD1;
  const identity = { uid: "user-1", email: "user@example.test" };

  beforeEach(() => {
    database = new SqliteD1();
    database.sqlite.exec(`
      CREATE TABLE users (
        uid TEXT PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT, role TEXT, karma INTEGER DEFAULT 0,
        avt INTEGER, nickname TEXT UNIQUE, nickname_customized INTEGER, uid_number INTEGER UNIQUE,
        uid_suffix TEXT, email_verified TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, last_active TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE user_uid_sequence (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE auth_users (id TEXT PRIMARY KEY, email TEXT, emailVerified INTEGER DEFAULT 1);
      INSERT INTO users (uid, email, role, karma, nickname, last_active)
        VALUES ('user-1', 'user@example.test', 'n', 2, 'Tester', datetime('now', '-5 minutes'));
    `);
  });
  afterEach(() => database.sqlite.close());

  it("uses only reads for repeated activity within an hour, without caching roles or karma", async () => {
    const first = await ensureUserProfile(database.db, identity);
    database.sqlite.exec("UPDATE users SET role = 's', karma = 1 WHERE uid = 'user-1'");
    const second = await ensureUserProfile(database.db, identity);
    expect(first.role).toBe("n");
    expect(second).toMatchObject({ role: "s", karma: 1, lastActive: first.lastActive });
    expect(database.queries).toHaveLength(2);
    expect(database.queries.every((query) => query.sql.startsWith("SELECT") && query.changes === 0)).toBe(true);
  });

  it("writes the activity timestamp only once across concurrent stale-profile requests", async () => {
    database.sqlite.exec("UPDATE users SET last_active = datetime('now', '-2 hours') WHERE uid = 'user-1'");
    await Promise.all([ensureUserProfile(database.db, identity), ensureUserProfile(database.db, identity)]);
    expect(database.queries.reduce((total, query) => total + query.changes, 0)).toBe(1);
    const count = database.queries.length;
    await ensureUserProfile(database.db, identity);
    expect(database.queries).toHaveLength(count + 1);
    expect(database.queries.at(-1)!.sql.startsWith("SELECT")).toBe(true);
  });

  it("persists an email change immediately even when activity was just written", async () => {
    expect(await ensureUserProfile(database.db, { ...identity, email: "NEW@example.test" }))
      .toMatchObject({ uid: identity.uid, email: "new@example.test" });
    expect(database.queries.reduce((total, query) => total + query.changes, 0)).toBe(1);
  });

  it("preserves first-time profile creation", async () => {
    database.sqlite.exec("INSERT INTO auth_users (id, email) VALUES ('new-user', 'new@example.test')");
    const created = await ensureUserProfile(database.db, { uid: "new-user", email: "new@example.test", displayName: "NewTester" });
    expect(created).toMatchObject({ uid: "new-user", email: "new@example.test", nickname: "NewTester", role: "n" });
    const count = database.queries.length;
    await ensureUserProfile(database.db, { uid: "new-user", email: "new@example.test" });
    expect(database.queries).toHaveLength(count + 1);
  });

  it("allocates once across concurrent bootstrap requests and preserves historical gaps", async () => {
    database.sqlite.exec("INSERT INTO user_uid_sequence (id) VALUES (17); INSERT INTO auth_users (id, email) VALUES ('new-user', 'new@example.test')");
    const identity = { uid: "new-user", email: "new@example.test", displayName: "NewTester" };
    const users = await Promise.all([ensureUserProfile(database.db, identity), ensureUserProfile(database.db, identity)]);
    expect(users.map((user) => user.uidNumber)).toEqual([100018, 100018]);
    expect(database.sqlite.prepare("SELECT COUNT(*) AS n FROM user_uid_sequence").get()!.n).toBe(2);
  });

  it("rolls back the number on failure and retries nickname collisions without gaps", async () => {
    database.sqlite.exec("INSERT INTO auth_users (id, email) VALUES ('new-user', 'new@example.test'); CREATE TRIGGER fail_profile BEFORE INSERT ON users BEGIN SELECT RAISE(ABORT, 'storage failure'); END;");
    const identity = { uid: "new-user", email: "new@example.test", displayName: "Tester" };
    await expect(ensureUserProfile(database.db, identity)).rejects.toThrow("storage failure");
    expect(database.sqlite.prepare("SELECT COUNT(*) AS n FROM user_uid_sequence").get()!.n).toBe(0);
    database.sqlite.exec("DROP TRIGGER fail_profile");
    const profile = await ensureUserProfile(database.db, identity);
    expect(profile.uidNumber).toBe(100001);
    expect(profile.nickname).toBe("Testernewuse");
    expect(database.sqlite.prepare("SELECT COUNT(*) AS n FROM user_uid_sequence").get()!.n).toBe(1);
  });

  it("never returns a different UUID's profile for an email match", async () => {
    await expect(ensureUserProfile(database.db, { uid: "different-user", email: identity.email }))
      .rejects.toMatchObject({ status: 409, code: "PROFILE_IDENTITY_CONFLICT" });
    expect(database.sqlite.prepare("SELECT COUNT(*) AS n FROM user_uid_sequence").get()!.n).toBe(0);
  });

  it("does not allocate for a removed or no longer verified repair identity", async () => {
    database.sqlite.exec("INSERT INTO auth_users (id, email, emailVerified) VALUES ('pending-user', 'pending@example.test', 0)");
    await expect(ensureUserProfile(database.db, { uid: "pending-user", email: "pending@example.test", verifiedOnly: true })).rejects.toThrow();
    expect(database.sqlite.prepare("SELECT COUNT(*) AS n FROM user_uid_sequence").get()!.n).toBe(0);
  });

  it("keeps the original registration date but records activity for an actual authenticated request", async () => {
    database.sqlite.exec("INSERT INTO auth_users (id, email) VALUES ('returning-user', 'returning@example.test')");
    const before = Date.now();
    const profile = await ensureUserProfile(database.db, { uid: "returning-user", email: "returning@example.test", createdAt: "2026-04-01T01:02:03Z" });
    expect(profile.createdAt).toBe("2026-04-01 01:02:03");
    const activity = Date.parse(`${profile.lastActive.replace(" ", "T")}Z`);
    expect(activity).toBeGreaterThanOrEqual(before - 1000);
    expect(activity).toBeLessThanOrEqual(Date.now());
  });

  it("resolves users by their public UID", async () => {
    database.sqlite.exec("UPDATE users SET uid_number = 103427, uid_suffix = 'VA' WHERE uid = 'user-1'");

    await expect(getUserByPublicUid(database.db, "103427va")).resolves.toMatchObject({
      uid: "user-1",
      email: "user@example.test",
      uidNumber: 103427,
      uidSuffix: "VA",
    });
    await expect(getUserByPublicUid(database.db, "not-a-public-uid")).resolves.toBeNull();
  });
});
