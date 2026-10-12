import { Hono } from "hono";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createUGCImageDatabase } from "../test/ugcImageDatabase";
import { ApiError } from "../lib/errors";
import type { AppEnv, AuthUser } from "../types/app";

vi.mock("../middleware/auth", () => ({
  requireAuth: async (c: { get: (key: string) => unknown }, next: () => Promise<void>) => {
    if (!c.get("authUser")) throw new ApiError(401, "UNAUTHORIZED", "Session is invalid.");
    await next();
  }
}));
vi.mock("../middleware/rate-limit", () => ({ rateLimit: () => async (_c: unknown, next: () => Promise<void>) => next() }));
import { createMeRoutes } from "./me";

let database: ReturnType<typeof createUGCImageDatabase>;
const get = vi.fn();
beforeEach(() => {
  database = createUGCImageDatabase();
  database.sqlite.exec("ALTER TABLE ugc_submissions ADD COLUMN mime_type TEXT; UPDATE ugc_submissions SET mime_type = 'image/webp';");
  get.mockReset();
  get.mockResolvedValue({
    body: new Uint8Array([82, 73, 70, 70]),
    httpEtag: '"test"',
    httpMetadata: { contentType: "image/webp" },
    writeHttpMetadata: (headers: Headers) => headers.set("Content-Type", "image/webp")
  });
});
afterEach(() => database.sqlite.close());

function request(id: string, uid?: string) {
  const app = new Hono<AppEnv>();
  app.onError((error) => {
    if (error instanceof ApiError) return new Response(error.code, { status: error.status });
    throw error;
  });
  if (uid) app.use("*", async (c, next) => {
    c.set("authUser", { uid } as AuthUser);
    await next();
  });
  app.route("/me/v1", createMeRoutes());
  return app.request(`http://localhost/me/v1/contributions/${id}/preview`, {}, {
    DB: database.db, UGC_BUCKET: { get } as unknown as R2Bucket
  });
}

it("serves an owner's image bytes with private cache headers", async () => {
  const response = await request("photo", "author");
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("image/webp");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([82, 73, 70, 70]));
  expect(get).toHaveBeenCalledWith("images/photo.webp");
});

it("keeps historical previews available to their owner only", async () => {
  database.sqlite.exec("UPDATE ugc_submissions SET status = 'stale' WHERE id = 'photo'");
  expect((await request("photo", "author")).status).toBe(200);
  get.mockClear();
  expect((await request("photo", "other")).status).toBe(404);
  expect(get).not.toHaveBeenCalled();
});

it("rejects unauthenticated requests and missing image objects", async () => {
  expect((await request("photo")).status).toBe(401);
  expect(get).not.toHaveBeenCalled();
  get.mockResolvedValue(null);
  expect((await request("photo", "author")).status).toBe(404);
});
