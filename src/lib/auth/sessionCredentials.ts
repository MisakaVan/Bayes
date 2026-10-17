import { createCookieGetter, parseCookies } from "better-auth/cookies";
import type { Bindings } from "../../types/app";
import { authCookieOptions } from "./origins";

// This is only a presence check. Better Auth still verifies every credential.
export function hasSessionCredentials(env: Bindings, headers: Headers): boolean {
  if (headers.get("authorization")?.trim()) return true;
  const raw = headers.get("cookie");
  if (!raw) return false;
  const options = authCookieOptions(env);
  const currentName = createCookieGetter(options)("session_token").name;
  const legacyName = createCookieGetter({
    ...options, advanced: { ...options.advanced, cookiePrefix: "better-auth" },
  })("session_token").name;
  const cookies = parseCookies(raw.split(";").map((cookie) => cookie.trim()).join("; "));
  return cookies.has(currentName) || cookies.has(legacyName);
}
