import { Hono } from "hono";
import { z } from "zod";
import { ApiError } from "../lib/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";
import { repairProfiles } from "../services/auth/profileRepairs";
import type { AppEnv } from "../types/app";
import { parseAuthTrustedOrigins } from "../lib/auth/origins";

const repairSchema = z.object({
  dryRun: z.boolean().default(true),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.object({ createdAt: z.string().datetime(), id: z.string().min(1).max(128) }).optional(),
}).strict();

export function createAdminAuthRoutes() {
  const app = new Hono<AppEnv>();
  app.post("/profile-repairs", requireAuth, requireRole(["a"]), rateLimit("auth"), async (c) => {
    const origin = c.req.header("origin");
    if (!origin || ![...parseAuthTrustedOrigins(c.env), "https://admin.opendfieldmap.org"].includes(origin)) {
      throw new ApiError(403, "ORIGIN_NOT_ALLOWED", "A trusted origin is required.");
    }
    const body = await c.req.json().catch(() => null);
    const parsed = repairSchema.safeParse(body);
    if (!parsed.success) throw new ApiError(422, "VALIDATION_ERROR", "Invalid repair request.");
    c.header("Cache-Control", "private, no-store");
    return c.json(await repairProfiles(c.env.DB, parsed.data));
  });
  return app;
}
