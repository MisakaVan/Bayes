import { APIError } from "better-auth/api";
import { ensureUserProfile } from "../../repositories/users";
import { toApiError } from "../../middleware/error-handler";
import { toSerializableError } from "./errors";

export interface ProfileIdentity {
  id: string;
  email: string;
  name?: string;
  createdAt: Date;
  emailVerified: boolean;
}

export function authProfileFailure(error: unknown, uid: string, phase: string, startedAt: number): APIError {
  const failure = toApiError(error);
  console.error("[auth][profile] bootstrap failed", {
    uid, phase, elapsedMs: Date.now() - startedAt, code: failure.code,
    error: toSerializableError(error),
  });
  const status = failure.status === 409 ? "CONFLICT" : failure.status === 503 ? "SERVICE_UNAVAILABLE" : "INTERNAL_SERVER_ERROR";
  return new APIError(status, {
    code: failure.status === 500 ? "AUTH_PROFILE_BOOTSTRAP_FAILED" : failure.code,
    message: failure.status === 500 ? "Account details could not be prepared. Please try signing in again." : failure.message,
  }, failure.status === 503 ? { "Retry-After": "5" } : undefined);
}

export async function prepareAuthProfile(db: D1Database, user: ProfileIdentity, phase: string) {
  const startedAt = Date.now();
  try {
    return await ensureUserProfile(db, {
      uid: user.id, email: user.email, displayName: user.name,
      createdAt: user.createdAt.toISOString(), lastActive: new Date().toISOString(),
      emailVerified: user.emailVerified, touchActivity: false,
    });
  } catch (error) {
    throw authProfileFailure(error, user.id, phase, startedAt);
  }
}
