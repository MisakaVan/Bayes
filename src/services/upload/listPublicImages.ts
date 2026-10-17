import { getUgcReadConfig } from "../../lib/config";
import { ApiError } from "../../lib/errors";
import {
  PUBLIC_MARKER_IMAGE_CACHE_LIMIT,
  readPublicMarkerImageCache,
  resolvePublicImageCacheNamespace,
  writePublicMarkerImageCache
} from "../../middleware/cache/publicMarkerImages";
import { readPublicImagesFromWorkersCache, publicReadResponse } from "../../middleware/cache/publicReadClient";
import {
  listActiveImagesByMarker,
  listImageViewerReactionsByMarker,
  listUserImagesByMarker
} from "../../repositories/submission/listImages";
import type { PublicSubmissionImage } from "../../repositories/submission/types";
import type { AppEnv } from "../../types/app";
import { getOptionalAuthIdentity, hasAuthHeaders, requireMarkerIds } from "./helpers";
import { imagesQuerySchema } from "./schemas";
import { resolveImageScope, resolvePrivateAssetBaseUrl, resolvePublicAssetBaseUrl } from "./scope";
import { applyImageViewerReactions } from "./viewerOverlay";

function groupPublicImagesByMarker(
  markerIds: string[],
  images: PublicSubmissionImage[]
): Map<string, PublicSubmissionImage[]> {
  const grouped = new Map<string, PublicSubmissionImage[]>();
  markerIds.forEach((markerId) => grouped.set(markerId, []));
  images.forEach((image) => {
    const bucket = grouped.get(image.markerId);
    if (bucket) {
      bucket.push(image);
    }
  });
  return grouped;
}

function flattenPublicImagesByMarker(
  markerIds: string[],
  grouped: Map<string, PublicSubmissionImage[]>,
  limit: number
): PublicSubmissionImage[] {
  return markerIds.flatMap((markerId) => (grouped.get(markerId) ?? []).slice(0, limit));
}

export async function listCachedPublicImagesByMarker(
  payload: {
    db: D1Database;
    kv?: KVNamespace;
    markerIds: string[];
    assetBaseUrl: string;
    pathPrefix?: string;
    excludePathPrefix?: string;
    limit: number;
    cacheNamespace: ReturnType<typeof resolvePublicImageCacheNamespace>;
    waitUntil: (promise: Promise<unknown>) => void;
  }
): Promise<PublicSubmissionImage[]> {
  const grouped = new Map<string, PublicSubmissionImage[]>();
  const missingIds: string[] = [];

  if (payload.kv) {
    const cacheResults = await Promise.all(
      [...new Set(payload.markerIds)].map(async (markerId) => ({
        markerId,
        images: await readPublicMarkerImageCache(payload.kv, payload.cacheNamespace, markerId)
      }))
    );

    cacheResults.forEach(({ markerId, images }) => {
      if (images) {
        grouped.set(markerId, images);
      } else {
        missingIds.push(markerId);
      }
    });
  } else {
    missingIds.push(...new Set(payload.markerIds));
  }

  for (let offset = 0; offset < missingIds.length; offset += 100) {
    const markerIds = missingIds.slice(offset, offset + 100);
    const items = await listActiveImagesByMarker(payload.db, {
      markerIds,
      assetBaseUrl: payload.assetBaseUrl,
      pathPrefix: payload.pathPrefix,
      excludePathPrefix: payload.excludePathPrefix,
      limit: PUBLIC_MARKER_IMAGE_CACHE_LIMIT,
    });
    const loaded = groupPublicImagesByMarker(markerIds, items);
    for (const [markerId, values] of loaded) grouped.set(markerId, values);
    if (payload.kv) {
      payload.waitUntil(Promise.all(markerIds.map((markerId) => (
        writePublicMarkerImageCache(payload.kv, payload.cacheNamespace, markerId, loaded.get(markerId)!)
      ))).catch(() => undefined));
    }
  }

  return flattenPublicImagesByMarker(payload.markerIds, grouped, payload.limit);
}

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
  const config = getUgcReadConfig(c.env);
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
  const config = getUgcReadConfig(c.env);
  const scope = resolveImageScope(c.req.raw, config.ugcUploadPathPrefix, parsed.data.scope);
  const limit = parsed.data.limit ?? 6;
  const assetBaseUrl = resolvePublicAssetBaseUrl(c.req.url, config.ugcAssetBaseUrl);
  const publicResponsePromise = readPublicImagesFromWorkersCache({
    markerIds: ids,
    limit,
    cacheNamespace: resolvePublicImageCacheNamespace(scope),
    assetBaseUrl
  });

  if (parsed.data.publicOnly === "1" || !hasAuthHeaders(c.req.raw.headers)) {
    return publicReadResponse(await publicResponsePromise);
  }

  const [publicResponse, identity] = await Promise.all([
    publicResponsePromise,
    getOptionalAuthIdentity(c.env, c.req.raw.headers)
  ]);
  if (!identity || publicResponse instanceof Response) return publicReadResponse(publicResponse);

  const { payload } = publicResponse;
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
    const value = publicResponse.headers[header];
    if (value !== undefined) response.headers.set(header, value);
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("x-oem-viewer-overlay", "image");
  return response;
}
