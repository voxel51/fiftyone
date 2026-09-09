import { useEffect, useMemo, useState } from "react";

import {
  useGridPosterProvider,
  type GridPosterProvider,
  type GridPosterProviderDescriptor,
} from "../../../extensions/grid-posters";
import type { PointCloudCameraPose } from "../../../visualization/scene-3d";
import {
  getGridPosterCache,
  recordGridPosterDiagnostic,
  shouldReplaceGridPoster,
  type GridPosterCacheEntry,
} from "./grid-poster-cache";
import { getGridPosterPersistence } from "./grid-poster-persistence";

export type GridPosterProviderLookupStatus =
  | "idle"
  | "loading"
  | "hit"
  | "miss";

const GRID_POSTER_PROVIDER_LOOKUP_TIMEOUT_MS = 5_000;

type AbortableLookupOptions<Result> = {
  readonly onError: () => void;
  readonly onSuccess: (result: Result) => void;
  readonly onTimeout: () => void;
  readonly run: (signal: AbortSignal) => Promise<Result>;
  readonly timeoutMs: number;
};

/** Runs a lookup with shared timeout, abort, and stale-result suppression. */
function runAbortableLookup<Result>({
  onError,
  onSuccess,
  onTimeout,
  run,
  timeoutMs,
}: AbortableLookupOptions<Result>): () => void {
  const controller = new AbortController();
  let active = true;
  const timeout = window.setTimeout(() => {
    active = false;
    controller.abort();
    onTimeout();
  }, timeoutMs);
  void run(controller.signal)
    .then((result) => {
      if (active) onSuccess(result);
    })
    .catch((error: unknown) => {
      if (!active) return;
      if (error instanceof Error && error.name === "AbortError") return;
      onError();
    })
    .finally(() => window.clearTimeout(timeout));
  return () => {
    active = false;
    window.clearTimeout(timeout);
    controller.abort();
  };
}

export interface ResolvedGridPosterProviderDescriptor {
  readonly descriptor: GridPosterProviderDescriptor;
  readonly provider: GridPosterProvider;
}

/** Resolves optional precomputed-poster metadata for one visible sample. */
export function useGridPosterProviderDescriptor(
  datasetId: string,
  sampleId: string | undefined,
  enabled: boolean,
): {
  readonly resolved: ResolvedGridPosterProviderDescriptor | null;
  readonly status: GridPosterProviderLookupStatus;
} {
  const provider = useGridPosterProvider();
  const shouldResolve = enabled && Boolean(sampleId) && provider !== null;
  const key = shouldResolve ? `${provider.id}:${datasetId}:${sampleId}` : null;
  const [lookup, setLookup] = useState<{
    readonly key: string | null;
    readonly resolved: ResolvedGridPosterProviderDescriptor | null;
    readonly status: GridPosterProviderLookupStatus;
  }>({ key: null, resolved: null, status: "idle" });

  useEffect(() => {
    if (!key || !sampleId || !provider) return undefined;
    const recordMiss = () => {
      recordGridPosterDiagnostic("providerDescriptorMisses");
      setLookup({ key, resolved: null, status: "miss" });
    };
    setLookup({ key, resolved: null, status: "loading" });
    return runAbortableLookup<GridPosterProviderDescriptor | null>({
      onError: recordMiss,
      onSuccess: (descriptor) => {
        recordGridPosterDiagnostic(
          descriptor ? "providerDescriptorHits" : "providerDescriptorMisses",
        );
        setLookup({
          key,
          resolved: descriptor ? { descriptor, provider } : null,
          status: descriptor ? "hit" : "miss",
        });
      },
      onTimeout: recordMiss,
      run: (signal) =>
        provider.resolveDescriptor({ datasetId, sampleId }, signal),
      timeoutMs: GRID_POSTER_PROVIDER_LOOKUP_TIMEOUT_MS,
    });
  }, [datasetId, key, provider, sampleId]);

  if (!enabled) return { resolved: null, status: "idle" };
  if (!provider || !sampleId) return { resolved: null, status: "miss" };
  if (lookup.key !== key) return { resolved: null, status: "loading" };
  return lookup;
}

/** Loads a selected provider artifact into the shared poster cache tiers. */
export function useProvidedGridPoster({
  cacheKey,
  cameraPose,
  enabled,
  posterStartTimeNs,
  resolved,
  selectedSourceName,
}: {
  readonly cacheKey: string | null;
  readonly cameraPose: PointCloudCameraPose | null;
  readonly enabled: boolean;
  readonly posterStartTimeNs: bigint | null;
  readonly resolved: ResolvedGridPosterProviderDescriptor | null;
  readonly selectedSourceName: string | null;
}): {
  readonly entry: GridPosterCacheEntry | null;
  readonly status: GridPosterProviderLookupStatus;
} {
  const selection = useMemo(
    () =>
      resolved?.descriptor.select({
        cameraPose,
        posterStartTimeNs,
        selectedSourceName,
      }) ?? null,
    [cameraPose, posterStartTimeNs, resolved, selectedSourceName],
  );
  const requestKey =
    enabled && cacheKey && selection && resolved
      ? `${resolved.provider.id}:${cacheKey}:${selection.identity}`
      : null;
  const [lookup, setLookup] = useState<{
    readonly entry: GridPosterCacheEntry | null;
    readonly key: string | null;
    readonly status: GridPosterProviderLookupStatus;
  }>({ entry: null, key: null, status: "idle" });

  useEffect(() => {
    if (!requestKey || !cacheKey || !resolved || !selection) return undefined;
    const recordMiss = () => {
      recordGridPosterDiagnostic("providerArtifactFailures");
      setLookup({ entry: null, key: requestKey, status: "miss" });
    };
    setLookup({ entry: null, key: requestKey, status: "loading" });
    return runAbortableLookup<Uint8Array>({
      onError: recordMiss,
      onSuccess: (bytes) => {
        if (bytes.byteLength !== selection.byteLength) {
          throw new Error("Grid poster provider byte length mismatch");
        }
        const entry: GridPosterCacheEntry = {
          bytes,
          height: selection.height,
          mimeType: selection.mimeType,
          provider: {
            artifactIdentity: selection.identity,
            id: resolved.provider.id,
            mediaKind: selection.mediaKind,
            policyVersion: selection.policyVersion,
            revision: resolved.descriptor.cacheRevision,
            variant: selection.variant,
          },
          sourceKind: selection.sourceKind,
          streamId: selection.streamId,
          streamSourceName: selection.streamSourceName,
          streamSourceNames: selection.streamSourceNames,
          width: selection.width,
        };
        const cache = getGridPosterCache();
        const current = cache.peek(cacheKey);
        recordGridPosterDiagnostic("providerArtifactHits");
        if (!shouldReplaceGridPoster(current, entry)) {
          setLookup({ entry: current, key: requestKey, status: "hit" });
          return;
        }
        cache.put(cacheKey, entry);
        void getGridPosterPersistence()
          .put(cacheKey, entry)
          .catch(() => recordGridPosterDiagnostic("providerArtifactFailures"));
        setLookup({ entry, key: requestKey, status: "hit" });
      },
      onTimeout: recordMiss,
      run: selection.load,
      timeoutMs: GRID_POSTER_PROVIDER_LOOKUP_TIMEOUT_MS,
    });
  }, [cacheKey, requestKey, resolved, selection]);

  if (!requestKey) return { entry: null, status: enabled ? "miss" : "idle" };
  if (lookup.key !== requestKey) return { entry: null, status: "loading" };
  return lookup;
}
