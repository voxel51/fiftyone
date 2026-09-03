import { LRUCache } from "lru-cache";

import { getFetchFunctionExtended } from "@fiftyone/utilities";

import {
  MAX_MANIFEST_AGE_MS,
  manifestMaxAgeMs,
  type TransportMediaAssetManifest,
} from "./episode-manifest-transport";

/**
 * Tiles mount independently and each knows only its own sample, so unbatched
 * they issue a page of requests that queue behind the browser's connection
 * limit — which is what a user waits on, whatever each costs the server.
 */

/** Matches the server's per-request cap. */
const MAX_PAGE_SAMPLE_IDS = 512;

/**
 * Only meant to catch a hang; the transport has no timeout of its own and a
 * request that never settles strands every tile batched into it. Kept long
 * because most of a browser's wait is its own connection queue, and cutting
 * that short turns one slow page into several.
 */
const PAGE_REQUEST_TIMEOUT_MS = 60000;

/** A failed tile is terminal — nothing re-requests it — so retry once. */
const PAGE_REQUEST_ATTEMPTS = 2;

/**
 * Bounded in time because a manifest pins the URLs its reader fetches with and
 * the revisions its asset identities are built from. Each entry expires on the
 * bound its own response carried - a share of the lifetime the server signed
 * for - under this ceiling.
 */
const MANIFEST_CACHE_MAX_ENTRIES = 4096;

const resolved = new LRUCache<string, TransportMediaAssetManifest>({
  max: MANIFEST_CACHE_MAX_ENTRIES,
  ttl: MAX_MANIFEST_AGE_MS,
  ttlAutopurge: true,
});

/** The server's reason, so a tile reports why rather than that nothing came. */
const failures = new LRUCache<string, string>({
  max: MANIFEST_CACHE_MAX_ENTRIES,
  ttl: MAX_MANIFEST_AGE_MS,
  ttlAutopurge: true,
});

interface ManifestErrorDto {
  readonly detail?: string;
  readonly kind?: string;
  readonly status?: number;
}

interface ManifestPageDto {
  readonly errors?: Record<string, ManifestErrorDto | undefined>;
  readonly manifests?: Record<string, TransportMediaAssetManifest | undefined>;
}

/** In-flight page requests, so a tile awaits a page already asked for. */
const inFlight = new Map<string, Promise<void>>();

/**
 * A task's worth of sample ids, per dataset. A microtask boundary is what
 * turns a page of mounting tiles into one request without a timer to tune.
 */
const collecting = new Map<string, Set<string>>();

function cacheKey(datasetId: string, sampleId: string): string {
  return `${datasetId}:${sampleId}`;
}

/** Drops everything remembered about resolved manifests. Tests only. */
export function resetEpisodeManifestCachesForTests(): void {
  resolved.clear();
  failures.clear();
  inFlight.clear();
  collecting.clear();
}

/**
 * Fetches the manifests for a page of samples as one request.
 *
 * Called by whoever holds the page - the grid pager - rather than assembled
 * from what individual tiles happen to ask for.
 */
export async function prefetchEpisodeManifests(
  datasetId: string,
  sampleIds: readonly string[],
): Promise<void> {
  // A sample already being fetched is not asked for again: the pager
  // prefetches a page while its tiles are mounting and asking for
  // themselves, and both arrive here.
  const wanted = [...new Set(sampleIds)].filter((sampleId) => {
    const key = cacheKey(datasetId, sampleId);
    return !resolved.has(key) && !inFlight.has(key);
  });
  if (wanted.length === 0) {
    return;
  }

  // Every chunk is registered before any is awaited. Registered as each one's
  // turn came, a tile in the second chunk finds nothing to join and asks for
  // itself alone - the stampede this exists to prevent, on the largest pages.
  const requests = wanted.reduce<
    { readonly chunk: readonly string[]; readonly request: Promise<void> }[]
  >((pages, _sampleId, index) => {
    if (index % MAX_PAGE_SAMPLE_IDS !== 0) {
      return pages;
    }

    const chunk = wanted.slice(index, index + MAX_PAGE_SAMPLE_IDS);
    const request = fetchInto(datasetId, chunk);
    for (const sampleId of chunk) {
      inFlight.set(cacheKey(datasetId, sampleId), request);
    }

    pages.push({ chunk, request });
    return pages;
  }, []);

  try {
    await Promise.all(requests.map(({ request }) => request));
  } finally {
    for (const { chunk, request } of requests) {
      for (const sampleId of chunk) {
        if (inFlight.get(cacheKey(datasetId, sampleId)) === request) {
          inFlight.delete(cacheKey(datasetId, sampleId));
        }
      }
    }
  }
}

/** Returns one sample's manifest, joining the page request that covers it. */
export async function requestEpisodeManifest(
  datasetId: string,
  sampleId: string,
): Promise<TransportMediaAssetManifest> {
  const key = cacheKey(datasetId, sampleId);
  const cached = resolved.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const collectingFor = collecting.get(datasetId);
  if (collectingFor) {
    collectingFor.add(sampleId);
  } else {
    const batch = new Set([sampleId]);
    collecting.set(datasetId, batch);
    queueMicrotask(() => {
      collecting.delete(datasetId);
      void prefetchEpisodeManifests(datasetId, [...batch]);
    });
  }

  await Promise.resolve();
  const pending = inFlight.get(key);
  if (pending) {
    await pending.catch(() => undefined);
    const filled = resolved.get(key);
    if (filled !== undefined) {
      return filled;
    }

    // The page covering this sample failed. Re-asking for this one sample
    // would turn one failed page into a request per tile, arriving exactly
    // when the browser is already saturated. Nothing here retries; the tile
    // reports why, and asks again when it next mounts.
    throw new Error(
      failures.get(key) ?? `No manifest was returned for sample ${sampleId}`,
    );
  }

  // Nothing collected this sample - it settled before the batch went out - so
  // it is asked for on its own. Nothing can have started covering it since
  // the check above: no await separates them from the prefetch's own filter.
  await prefetchEpisodeManifests(datasetId, [sampleId]);

  const filled = resolved.get(key);
  if (filled === undefined) {
    throw new Error(
      failures.get(key) ?? `No manifest was returned for sample ${sampleId}`,
    );
  }

  return filled;
}

async function fetchInto(
  datasetId: string,
  sampleIds: readonly string[],
): Promise<void> {
  try {
    const response = await requestPage(datasetId, sampleIds);
    for (const [sampleId, manifest] of Object.entries(
      response.manifests ?? {},
    )) {
      if (manifest) {
        resolved.set(cacheKey(datasetId, sampleId), manifest, {
          ttl: manifestMaxAgeMs(manifest),
        });
      }
    }

    for (const [sampleId, error] of Object.entries(response.errors ?? {})) {
      if (error?.detail) {
        failures.set(cacheKey(datasetId, sampleId), error.detail);
      }
    }
  } catch (error: unknown) {
    // Only a deployment that does not have this route falls back. A slow or
    // aborted page must not fan out into one request per sample: that is the
    // stampede batching exists to prevent, arriving exactly when the browser
    // is already saturated.
    if (!isMissingRoute(error)) {
      for (const sampleId of sampleIds) {
        failures.set(
          cacheKey(datasetId, sampleId),
          error instanceof Error
            ? error.message
            : "Unable to resolve episode assets",
        );
      }

      return;
    }

    await Promise.all(
      sampleIds.map(async (sampleId) => {
        try {
          const { response } = await getFetchFunctionExtended()<
            undefined,
            TransportMediaAssetManifest
          >({
            method: "GET",
            path: `/dataset/${encodeURIComponent(
              datasetId,
            )}/sample/${encodeURIComponent(sampleId)}/multimodal/manifest`,
            result: "json",
          });
          resolved.set(cacheKey(datasetId, sampleId), response, {
            ttl: manifestMaxAgeMs(response),
          });
        } catch {
          // Reported by whichever tile awaits this sample
        }
      }),
    );
  }
}

/** Whether this deployment simply does not serve the page route. */
function isMissingRoute(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  return status === 404 || status === 405;
}

async function requestPage(
  datasetId: string,
  sampleIds: readonly string[],
): Promise<ManifestPageDto> {
  let failure: unknown;
  for (let attempt = 0; attempt < PAGE_REQUEST_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PAGE_REQUEST_TIMEOUT_MS);
    try {
      const { response } = await getFetchFunctionExtended()<
        { sample_ids: readonly string[] },
        ManifestPageDto
      >({
        body: { sample_ids: sampleIds },
        method: "POST",
        path: `/dataset/${encodeURIComponent(datasetId)}/multimodal/manifests`,
        result: "json",
        signal: controller.signal,
      });
      return response;
    } catch (error: unknown) {
      failure = error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw failure;
}
