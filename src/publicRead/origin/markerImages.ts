import { InFlightBatchLoader } from "./inFlightBatchLoader";
import { listActiveImagesByMarker } from "../../repositories/submission/listImages";
import { PUBLIC_MARKER_IMAGE_CACHE_LIMIT, type PublicImageCacheNamespace } from "../contract/markers";
import type { PublicSubmissionImage } from "../../repositories/submission/types";
import {
  DEFAULT_KV_READ_CACHE_TTL_SECONDS,
  getJsonFromKv,
  putJsonToKv,
  sha256Hex
} from "../../middleware/cache/kvJson";
import { CACHE_KEY_VERSIONS } from "../../middleware/cache/versions";

export const PUBLIC_MARKER_IMAGE_POSITIVE_TTL_SECONDS = 90 * 24 * 60 * 60;
export const PUBLIC_MARKER_IMAGE_EMPTY_TTL_SECONDS = 60 * 60;

const PUBLIC_MARKER_IMAGE_KV_KEY_PREFIX = `ugc:marker-images:${CACHE_KEY_VERSIONS.publicMarkerImages}:`;
const PUBLIC_IMAGE_CACHE_NAMESPACES = ["default", "test", "prod"] as const;

type PublicMarkerImageCacheEntry = {
  items: PublicSubmissionImage[];
};

async function getPublicMarkerImageCacheKey(
  namespace: PublicImageCacheNamespace,
  markerId: string
): Promise<string> {
  return `${PUBLIC_MARKER_IMAGE_KV_KEY_PREFIX}${namespace}:${await sha256Hex(markerId)}`;
}

async function readPublicMarkerImageCache(
  kv: KVNamespace | undefined,
  namespace: PublicImageCacheNamespace,
  markerId: string
): Promise<PublicSubmissionImage[] | null> {
  if (!kv) return null;

  const entry = await getJsonFromKv<PublicMarkerImageCacheEntry>(
    kv,
    await getPublicMarkerImageCacheKey(namespace, markerId),
    { cacheTtl: DEFAULT_KV_READ_CACHE_TTL_SECONDS }
  );
  if (!entry || !Array.isArray(entry.items)) {
    return null;
  }

  return entry.items;
}

async function writePublicMarkerImageCache(
  kv: KVNamespace | undefined,
  namespace: PublicImageCacheNamespace,
  markerId: string,
  items: PublicSubmissionImage[]
): Promise<void> {
  if (!kv) return;

  const expirationTtl = items.length > 0
    ? PUBLIC_MARKER_IMAGE_POSITIVE_TTL_SECONDS
    : PUBLIC_MARKER_IMAGE_EMPTY_TTL_SECONDS;

  await putJsonToKv(
    kv,
    await getPublicMarkerImageCacheKey(namespace, markerId),
    { items },
    { expirationTtl }
  );
}

export async function deletePublicMarkerImageCache(
  kv: KVNamespace | undefined,
  markerId: string
): Promise<void> {
  if (!kv) return;

  await Promise.all(
    PUBLIC_IMAGE_CACHE_NAMESPACES.map(async (namespace) => {
      await kv.delete(await getPublicMarkerImageCacheKey(namespace, markerId));
    })
  );
}

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
    cacheNamespace: PublicImageCacheNamespace;
    waitUntil: (promise: Promise<unknown>) => void;
  }
): Promise<PublicSubmissionImage[]> {
  const grouped = new Map<string, PublicSubmissionImage[]>();
  const missingIds: string[] = [];

  if (payload.kv) {
    const cacheResults = await Promise.all(
      payload.markerIds.map(async (markerId) => ({
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
    missingIds.push(...payload.markerIds);
  }

  if (missingIds.length > 0) {
    const loader = new InFlightBatchLoader<PublicSubmissionImage[]>();
    const loaded = await Promise.all(missingIds.map(async (markerId) => ({
      markerId,
      images: await loader.load(markerId, async (markerIds) => {
        const dbImages = await listActiveImagesByMarker(payload.db, {
          markerIds,
          assetBaseUrl: payload.assetBaseUrl,
          pathPrefix: payload.pathPrefix,
          excludePathPrefix: payload.excludePathPrefix,
          limit: PUBLIC_MARKER_IMAGE_CACHE_LIMIT
        });
        const dbGrouped = groupPublicImagesByMarker(markerIds, dbImages);
        if (payload.kv) {
          payload.waitUntil(Promise.all(markerIds.map((missingMarkerId) => (
            writePublicMarkerImageCache(
              payload.kv,
              payload.cacheNamespace,
              missingMarkerId,
              dbGrouped.get(missingMarkerId) ?? []
            )
          ))).catch(() => undefined));
        }
        return dbGrouped;
      })
    })));

    loaded.forEach(({ markerId, images }) => {
      grouped.set(markerId, images);
    });
  }

  return flattenPublicImagesByMarker(payload.markerIds, grouped, payload.limit);
}
