import { useCallback, useEffect, useSyncExternalStore } from "react";
import { createTemporalTagsClient } from "./client";
import type { TemporalTag, TemporalTagsClient } from "./types";

type TagsBySample = ReadonlyMap<string, readonly TemporalTag[]>;

const EMPTY: TagsBySample = new Map();
const NO_TAGS: readonly TemporalTag[] = [];

type Entry = {
  bySample: TagsBySample;
  generation: number;
  loading: boolean;
};

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let defaultClient: TemporalTagsClient | undefined;

function getDefaultClient() {
  defaultClient ??= createTemporalTagsClient();

  return defaultClient;
}

function emit() {
  for (const listener of listeners) listener();
}

function entryFor(datasetId: string): Entry {
  let entry = entries.get(datasetId);
  if (!entry) {
    entry = { bySample: EMPTY, generation: 0, loading: false };
    entries.set(datasetId, entry);
  }

  return entry;
}

function groupBySample(tags: readonly TemporalTag[]): TagsBySample {
  const bySample = new Map<string, TemporalTag[]>();
  for (const tag of tags) {
    const group = bySample.get(tag.sampleId);
    if (group) group.push(tag);
    else bySample.set(tag.sampleId, [tag]);
  }

  return bySample;
}

function load(client: TemporalTagsClient, datasetId: string) {
  const entry = entryFor(datasetId);
  if (entry.loading) return;

  entry.loading = true;
  const generation = ++entry.generation;
  client
    .listDatasetTemporalTags({ datasetId })
    .then((tags) => {
      // an invalidation bumped past this response, so it is already stale
      if (entry.generation !== generation) return;
      entry.bySample = groupBySample(tags);
      entry.loading = false;
      emit();
    })
    .catch(() => {
      if (entry.generation !== generation) return;
      entry.loading = false;
      emit();
    });
}

/**
 * Refetches a dataset's tags after a mutation, so the grid reflects what the
 * modal just changed.
 */
export function invalidateDatasetTemporalTags(
  datasetId: string | undefined,
  client?: TemporalTagsClient,
) {
  if (!datasetId) return;

  const entry = entries.get(datasetId);
  if (!entry) return;

  // past any in-flight response, which would otherwise land as fresh
  entry.generation += 1;
  entry.loading = false;
  load(client ?? getDefaultClient(), datasetId);
}

/**
 * Every temporal tag on a dataset, grouped by sample.
 *
 * One request per dataset, shared by every subscriber: the grid renders a
 * source per tile, and a tile resolving its own tags over the network would
 * put one request per tile on the wire.
 */
export function useDatasetTemporalTags(
  datasetId: string | undefined,
  client?: TemporalTagsClient,
): TagsBySample {
  const tagsClient = client ?? getDefaultClient();
  const subscribe = useCallback((onStoreChange: () => void) => {
    listeners.add(onStoreChange);

    return () => {
      listeners.delete(onStoreChange);
    };
  }, []);
  const getSnapshot = useCallback(
    () => (datasetId ? (entries.get(datasetId)?.bySample ?? EMPTY) : EMPTY),
    [datasetId],
  );

  useEffect(() => {
    if (datasetId) load(tagsClient, datasetId);
  }, [datasetId, tagsClient]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** One sample's tags, read from the dataset's shared load. */
export function useSampleTemporalTagsFromDataset(
  datasetId: string | undefined,
  sampleId: string | undefined,
): readonly TemporalTag[] {
  const bySample = useDatasetTemporalTags(datasetId);

  return (sampleId ? bySample.get(sampleId) : undefined) ?? NO_TAGS;
}
