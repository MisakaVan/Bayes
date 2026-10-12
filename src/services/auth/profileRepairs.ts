import { ApiError } from "../../lib/errors";
import { toSerializableError } from "../../lib/auth/errors";
import { bootstrapUserProfile, formatPublicUid } from "../../repositories/users";
import type { Bindings } from "../../types/app";

export interface RepairCursor { createdAt: string; id: string }
interface Candidate {
  id: string; email: string; name: string; createdAt: string; lastActive: string;
  conflictingUid: string | null;
}
export interface RepairOptions { dryRun?: boolean; limit?: number; cursor?: RepairCursor; now?: number }
interface ConsistencyCounts {
  authUsers: number; businessUsers: number; verifiedMissingProfiles: number;
  unverifiedMissingProfiles: number; activeSessionsWithoutProfile: number;
  numericGaps: number; allocationHighWater: number;
}

export async function getAuthConsistency(db: D1Database) {
  const row = await db.prepare(`SELECT
    (SELECT COUNT(*) FROM auth_users) AS authUsers,
    (SELECT COUNT(*) FROM users) AS businessUsers,
    (SELECT COUNT(*) FROM auth_users a WHERE a.emailVerified = 1
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.uid = a.id)) AS verifiedMissingProfiles,
    (SELECT COUNT(*) FROM auth_users a WHERE a.emailVerified = 0
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.uid = a.id)) AS unverifiedMissingProfiles,
    (SELECT COUNT(DISTINCT s.userId) FROM auth_sessions s WHERE julianday(s.expiresAt) > julianday('now')
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.uid = s.userId)) AS activeSessionsWithoutProfile,
    (SELECT MAX(COALESCE(MAX(uid_number), 100000) - 100000,
        (SELECT COALESCE(MAX(seq), 0) FROM sqlite_sequence WHERE name = 'user_uid_sequence'))
        - COUNT(DISTINCT CASE WHEN uid_number > 100000 THEN uid_number END)
      FROM users) AS numericGaps,
    (SELECT COALESCE(MAX(seq), 0) FROM sqlite_sequence WHERE name = 'user_uid_sequence') AS allocationHighWater
  `).first<ConsistencyCounts>();
  if (!row) throw new ApiError(500, "INTERNAL_ERROR", "Could not read account consistency.");
  return { generatedAt: new Date().toISOString(), ...row };
}

export async function repairProfiles(db: D1Database, options: RepairOptions = {}) {
  const dryRun = options.dryRun !== false;
  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ApiError(422, "VALIDATION_ERROR", "Invalid repair batch size.");
  const cutoff = new Date((options.now ?? Date.now()) - 5 * 60_000).toISOString();
  const candidates = await db.prepare(`SELECT a.id, a.email, a.name, a.createdAt,
      COALESCE((SELECT s.createdAt FROM auth_sessions s WHERE s.userId = a.id ORDER BY julianday(s.createdAt) DESC LIMIT 1), a.createdAt) AS lastActive,
      (SELECT u.uid FROM users u WHERE u.email = a.email AND u.uid <> a.id LIMIT 1) AS conflictingUid
    FROM auth_users a WHERE a.emailVerified = 1 AND julianday(a.createdAt) <= julianday(?1)
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.uid = a.id)
      AND (?2 IS NULL OR julianday(a.createdAt) > julianday(?2)
        OR (julianday(a.createdAt) = julianday(?2) AND a.id > ?3))
    ORDER BY julianday(a.createdAt), a.id LIMIT ?4`)
    .bind(cutoff, options.cursor?.createdAt ?? null, options.cursor?.id ?? "", limit + 1).all<Candidate>();
  const page = candidates.results.slice(0, limit);
  const results: Array<{ uid: string; status: "would_create" | "created" | "existing" | "conflict" | "failed"; publicUid?: string; code?: string }> = [];
  for (const candidate of page) {
    if (candidate.conflictingUid) {
      results.push({ uid: candidate.id, status: "conflict", code: "PROFILE_IDENTITY_CONFLICT" });
      if (!dryRun) console.error("[auth][profile-repair] identity conflict", { uid: candidate.id });
      continue;
    }
    if (dryRun) { results.push({ uid: candidate.id, status: "would_create" }); continue; }
    const startedAt = Date.now();
    try {
      // Recheck identity and verification inside the atomic insert. Existing profiles
      // are never updated by a repair, including their activity or registration dates.
      const { user, created } = await bootstrapUserProfile(db, {
        uid: candidate.id, email: candidate.email, displayName: candidate.name,
        createdAt: candidate.createdAt, lastActive: candidate.lastActive, emailVerified: true,
        touchActivity: false, verifiedOnly: true,
      });
      const result = { uid: candidate.id, status: created ? "created" as const : "existing" as const,
        publicUid: formatPublicUid(user.uidNumber, user.uidSuffix) };
      results.push(result);
      console.warn("[auth][profile-repair] completed", { ...result, elapsedMs: Date.now() - startedAt });
    } catch (error) {
      const conflict = error instanceof ApiError && error.code === "PROFILE_IDENTITY_CONFLICT";
      results.push({ uid: candidate.id, status: conflict ? "conflict" : "failed", code: conflict ? error.code : "AUTH_PROFILE_BOOTSTRAP_FAILED" });
      console.error("[auth][profile-repair] failed", { uid: candidate.id, elapsedMs: Date.now() - startedAt, error: toSerializableError(error) });
    }
  }
  const last = page.at(-1);
  return { dryRun, cutoff, results,
    nextCursor: candidates.results.length > limit && last ? { createdAt: new Date(last.createdAt).toISOString(), id: last.id } : null };
}

const CURSOR_KEY = "auth:profile-repair:cursor";

export async function runProfileRecovery(env: Bindings, now = Date.now()) {
  if (new Date(now).getUTCMinutes() % 5 !== 0 || env.AUTH_PROFILE_REPAIR_ENABLED?.trim() !== "1") return;
  if (env.LOCK_SCHEDULED_JOBS && !["0", "false", "off", "no"].includes(env.LOCK_SCHEDULED_JOBS.trim().toLowerCase())) return;
  try {
    if (!env.OEM_KV) throw new Error("Profile recovery requires OEM_KV.");
    const stored = await env.OEM_KV.get<RepairCursor>(CURSOR_KEY, "json");
    const cursor = stored && typeof stored.id === "string" && Number.isFinite(Date.parse(stored.createdAt)) ? stored : undefined;
    const result = await repairProfiles(env.DB, { dryRun: false, limit: 20, cursor, now });
    if (result.nextCursor) await env.OEM_KV.put(CURSOR_KEY, JSON.stringify(result.nextCursor), { expirationTtl: 86400 });
    else await env.OEM_KV.delete(CURSOR_KEY);
    const health = await getAuthConsistency(env.DB);
    const log = health.activeSessionsWithoutProfile || health.verifiedMissingProfiles ? console.error : console.warn;
    log("[auth][profile-repair] health", health);
  } catch (error) {
    console.error("[auth][profile-repair] recovery failed", { error: toSerializableError(error) });
  }
}
