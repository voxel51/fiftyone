import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useGridSelectionDataset, useGridSelectionRequest } from "./grid-hooks";
import {
  createSegmentDetailsLoader,
  EMPTY_SEGMENTS,
} from "./model/segment-details";
import { savedSegmentPinScope } from "./segment-provenance";

// Scope keys include the dataset, view, filters and membership revision. Keep
// only a few recent loaders; each retains data only for subscribed samples.
const loaders = new Map<
  string,
  ReturnType<typeof createSegmentDetailsLoader>
>();

/** Saved ranges in the current results, shared by grid tiles and the player. */
export function useScopedSegments(sampleId: string) {
  const { datasetId, conversion } = useGridSelectionDataset();
  const { key, request } = useGridSelectionRequest();
  const active = Boolean(
    request.boundary.subsetId &&
    request.boundary.subsetScope === "segments" &&
    !conversion,
  );
  const loader = useMemo(() => {
    if (!active) return null;
    const cacheKey = `${datasetId}:${key}`;
    let value = loaders.get(cacheKey);
    if (!value) {
      value = createSegmentDetailsLoader(datasetId, request);
      loaders.set(cacheKey, value);
      if (loaders.size > 4) loaders.delete(loaders.keys().next().value!);
    }
    return value;
  }, [active, datasetId, key, request]);
  const subscribe = useCallback(
    (notify: () => void) =>
      loader && sampleId ? loader.subscribe(sampleId, notify) : () => undefined,
    [loader, sampleId],
  );
  const snapshot = useCallback(
    () => (loader && sampleId ? loader.get(sampleId) : EMPTY_SEGMENTS),
    [loader, sampleId],
  );
  return {
    ...useSyncExternalStore(subscribe, snapshot, snapshot),
    active,
    scopeId: active ? request.boundary.subsetId : undefined,
    pinScopeKey: active ? savedSegmentPinScope(request.boundary) : undefined,
    filtered: Boolean(request.boundary.provider),
    key,
  };
}
