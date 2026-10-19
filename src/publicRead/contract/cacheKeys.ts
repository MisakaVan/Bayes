import { sha256Hex } from "../../middleware/cache/kvJson";
import { CACHE_KEY_VERSIONS } from "../../middleware/cache/versions";
import type { PublicReadMarkerKind } from "./markers";

export function buildPublicReadCacheKey(path: string, searchParams: URLSearchParams): string {
  const search = searchParams.toString();
  const versionedPath = `/${CACHE_KEY_VERSIONS.publicReadResponses}${path}`;
  return search ? `${versionedPath}?${search}` : versionedPath;
}

export async function buildPublicReadMarkerTag(
  kind: PublicReadMarkerKind,
  markerId: string
): Promise<string> {
  return `ugc-${kind}:${await sha256Hex(markerId)}`;
}
