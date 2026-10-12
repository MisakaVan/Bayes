import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { ApiError } from "../lib/errors";
import { onAppError } from "../middleware/error-handler";
import { createAuthDatabase } from "../test/authDatabase";
import { createAdminAuthRoutes } from "./admin-auth";
import type { AppEnv, AuthUser, Bindings } from "../types/app";

vi.mock("../middleware/auth", async (original) => ({
  ...await original<typeof import("../middleware/auth")>(),
  requireAuth: async (c: import("hono").Context<AppEnv>, next: () => Promise<void>) => {
    const authorization = c.req.header("authorization");
    if (!authorization) throw new ApiError(401, "SESSION_REQUIRED", "Session is required.");
    c.set("authUser", { role: authorization === "admin" ? "a" : "n" } as AuthUser);
    await next();
  },
}));
vi.mock("../middleware/rate-limit", () => ({ rateLimit: () => async (_c: unknown, next: () => Promise<void>) => next() }));

describe("administrator profile repair endpoint", () => {
  let database: ReturnType<typeof createAuthDatabase>;
  let app: Hono<AppEnv>;
  beforeEach(() => {
    database = createAuthDatabase();
    database.sqlite.exec("INSERT INTO auth_users (id,name,email,emailVerified,createdAt) VALUES ('missing','Provider','missing@example.test',1,'2026-04-01')");
    app = new Hono<AppEnv>();
    app.onError(onAppError);
    app.route("/admin/v1/auth", createAdminAuthRoutes());
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => { database.sqlite.close(); vi.restoreAllMocks(); });
  function request(body: unknown, authorization: string | null = "admin", origin = "https://admin.opendfieldmap.org") {
    const headers = new Headers({ "content-type": "application/json", origin });
    if (authorization) headers.set("authorization", authorization);
    return app.request("/admin/v1/auth/profile-repairs", { method: "POST", headers, body: JSON.stringify(body) }, { DB: database.db } as Bindings);
  }
  it("requires authentication, administrator role and a trusted origin", async () => {
    expect((await request({}, null)).status).toBe(401);
    expect((await request({}, "member")).status).toBe(403);
    expect((await request({}, "admin", "https://untrusted.example")).status).toBe(403);
  });
  it("defaults to a preview and bounds the batch", async () => {
    const response = await request({});
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ dryRun: true, results: [{ uid: "missing", status: "would_create" }] });
    expect(database.sqlite.prepare("SELECT COUNT(*) AS n FROM users").get()!.n).toBe(0);
    expect((await request({ limit: 101 })).status).toBe(422);
    expect((await request({ dryRun: false })).status).toBe(200);
    expect(database.sqlite.prepare("SELECT COUNT(*) AS n FROM users").get()!.n).toBe(1);
  });
});
