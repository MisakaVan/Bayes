import { getRuntimeConfig } from "../../lib/config";
import { ApiError } from "../../lib/errors";
import { resolvePublicImageCacheNamespace } from "../../publicRead/client/scope";
import { fetchPublicImagesFromWorkersCache } from "../../publicRead/client/client";
import {
  listImageViewerReactionsByMarker,
  listUserImagesByMarker
} from "../../repositories/submission/listImages";
import type { PublicMarkerListResponse } from "../../publicRead/client/client";
import type { PublicSubmissionImage } from "../../repositories/submission/types";
import type { AppEnv } from "../../types/app";
import { getOptionalAuthIdentity, hasAuthHeaders, requireMarkerIds } from "./helpers";
import { imagesQuerySchema } from "./schemas";
import { resolveImageScope, resolvePrivateAssetBaseUrl, resolvePublicAssetBaseUrl } from "./scope";
import { applyImageViewerReactions } from "./viewerOverlay";

export async function handleListMyImages(c: import("hono").Context<AppEnv>) {
  const user = c.get("authUser");
  if (!user) {
    throw new ApiError(401, "UNAUTHORIZED", "Session is invalid.");
  }

  const parsed = imagesQuerySchema.safeParse({
    markerId: c.req.query("markerId"),
    markerIds: c.req.query("markerIds"),
    scope: c.req.query("scope"),
    limit: c.req.query("limit"),
    publicOnly: c.req.query("publicOnly") === "1" ? "1" : undefined
  });
  if (!parsed.success) {
    throw new ApiError(422, "VALIDATION_ERROR", "Invalid image query.", parsed.error.flatten());
  }

  const ids = requireMarkerIds(parsed.data, false);
  const config = getRuntimeConfig(c.env);
  const scope = resolveImageScope(c.req.raw, config.ugcUploadPathPrefix, parsed.data.scope);
  const items = await listUserImagesByMarker(c.env.DB, {
    userId: user.uid,
    markerIds: ids,
    assetBaseUrl: resolvePublicAssetBaseUrl(c.req.url, config.ugcAssetBaseUrl),
    privateAssetBaseUrl: resolvePrivateAssetBaseUrl(c.req.url),
    pathPrefix: scope.pathPrefix,
    excludePathPrefix: scope.excludePathPrefix,
    limit: parsed.data.limit ?? 6
  });

  const response = c.json({ items });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function handleListPublicImages(c: import("hono").Context<AppEnv>) {
  const parsed = imagesQuerySchema.safeParse({
    markerId: c.req.query("markerId"),
    markerIds: c.req.query("markerIds"),
    scope: c.req.query("scope"),
    limit: c.req.query("limit"),
    publicOnly: c.req.query("publicOnly") === "1" ? "1" : undefined
  });
  if (!parsed.success) {
    throw new ApiError(422, "VALIDATION_ERROR", "Invalid image query.", parsed.error.flatten());
  }

  const ids = requireMarkerIds(parsed.data);
  const config = getRuntimeConfig(c.env);
  const scope = resolveImageScope(c.req.raw, config.ugcUploadPathPrefix, parsed.data.scope);
  const limit = parsed.data.limit ?? 6;
  const assetBaseUrl = resolvePublicAssetBaseUrl(c.req.url, config.ugcAssetBaseUrl);
  const publicResponsePromise = fetchPublicImagesFromWorkersCache({
    markerIds: ids,
    limit,
    cacheNamespace: resolvePublicImageCacheNamespace(scope),
    assetBaseUrl
  });

  if (parsed.data.publicOnly === "1" || !hasAuthHeaders(c.req.raw.headers)) {
    return publicResponsePromise;
  }

  const [publicResponse, identity] = await Promise.all([
    publicResponsePromise,
    getOptionalAuthIdentity(c.env, c.req.raw.headers)
  ]);
  if (!identity || !publicResponse.ok) return publicResponse;

  const payload = await publicResponse.json() as PublicMarkerListResponse<PublicSubmissionImage>;
  const reactions = await listImageViewerReactionsByMarker(c.env.DB, {
    userId: identity.uid,
    markerIds: ids,
    submissionIds: payload.items.map((image) => image.id),
    pathPrefix: scope.pathPrefix,
    excludePathPrefix: scope.excludePathPrefix
  });
  const images = applyImageViewerReactions(payload.items, reactions);

  const response = c.json({ ...payload, items: images });
  for (const header of ["x-oem-partial-response", "x-oem-failed-marker-count"]) {
    const value = publicResponse.headers.get(header);
    if (value !== null) response.headers.set(header, value);
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("x-oem-viewer-overlay", "image");
  return response;
}
