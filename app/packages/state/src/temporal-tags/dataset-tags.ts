import { useCallback, useEffect, useSyncExternalStore } from "react";
import { createTemporalTagsClient } from "./client";
import type { TemporalTag, TemporalTagsClient } from "./types";

type TagsBySample = ReadonlyMap<string, readonly TemporalTag[]>;

const EMPTY: TagsBySample = new Map();
const NO_TAGS: readonly TemporalTag[] = [];

type Entry = {
  bySample: TagsBySample;
  generation: number;
  loaded: boolean;
  loading: boolean;
};

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const mutationListeners = new Set<() => void>();
let defaultClient: TemporalTagsClient | undefined;

function getDefaultClient() {
  defaultClient ??= createTemporalTagsClient();

  return defaultClient;
}

function emit() {
  for (const listener of listeners) listener();
}

function notifyMutated() {
  for (const listener of mutationListeners) listener();
}

function entryFor(datasetId: string): Entry {
  let entry = entries.get(datasetId);
  if (!entry) {
    entry = { bySample: EMPTY, generation: 0, loaded: false, loading: false };
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
  // Every tile that comes into view asks; only the first ask, or the first
  // after an invalidation, may reach the network.
  if (entry.loading || entry.loaded) return;

  entry.loading = true;
  const generation = ++entry.generation;
  client
    .listDatasetTemporalTags({ datasetId })
    .then((tags) => {
      // an invalidation bumped past this response, so it is already stale
      if (entry.generation !== generation) return;
      entry.bySample = groupBySample(tags);
      entry.loaded = true;
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

  notifyMutated();

  const entry = entries.get(datasetId);
  if (!entry) return;

  // past any in-flight response, which would otherwise land as fresh
  entry.generation += 1;
  entry.loaded = false;
  entry.loading = false;
  load(client ?? getDefaultClient(), datasetId);
}

/**
 * Replaces one sample's tags after a mutation, with that sample's tags as the
 * server now has them, so an edit does not refetch the whole dataset.
 */
export function setSampleTemporalTags(
  datasetId: string,
  sampleId: string,
  tags: readonly TemporalTag[],
  client?: TemporalTagsClient,
) {
  const entry = entries.get(datasetId);
  // A load still in flight may have been answered before the edit, so it is
  // superseded rather than patched.
  if (entry?.loading) {
    invalidateDatasetTemporalTags(datasetId, client);
    return;
  }

  notifyMutated();
  if (!entry?.loaded) return;

  const bySample = new Map(entry.bySample);
  if (tags.length) bySample.set(sampleId, tags);
  else bySample.delete(sampleId);
  entry.bySample = bySample;
  emit();
}

/**
 * Calls `listener` after every temporal tag mutation, on any dataset. Returns
 * the unsubscribe function.
 */
export function onTemporalTagsMutated(listener: () => void): () => void {
  mutationListeners.add(listener);

  return () => {
    mutationListeners.delete(listener);
  };
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
