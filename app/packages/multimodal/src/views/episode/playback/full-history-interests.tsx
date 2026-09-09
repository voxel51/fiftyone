import { useTileId } from "@fiftyone/tiling";
import { atom, createStore, useAtomValue } from "jotai";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/** Playback features that consume a stream's complete recording history. */
export type FullHistoryFeature = "location" | "pose" | "scene-update";

const EMPTY_STREAMS: readonly string[] = [];
const EMPTY_STREAMS_BY_FEATURE: ReadonlyMap<
  FullHistoryFeature,
  readonly string[]
> = new Map();

interface FullHistoryInterest {
  readonly feature: FullHistoryFeature;
  readonly streams: readonly string[];
}

const interestsByTileAtom = atom<ReadonlyMap<string, FullHistoryInterest>>(
  new Map(),
);
const streamsByFeatureAtom = atom((get) => {
  const streamsByFeature = new Map<FullHistoryFeature, readonly string[]>();
  const mutable = new Map<FullHistoryFeature, Set<string>>();
  for (const { feature, streams } of get(interestsByTileAtom).values()) {
    let union = mutable.get(feature);
    if (!union) {
      union = new Set();
      mutable.set(feature, union);
    }
    for (const stream of streams) union.add(stream);
  }
  for (const [feature, streams] of mutable) {
    streamsByFeature.set(feature, [...streams].sort());
  }
  return streamsByFeature;
});

type FullHistoryInterestsStore = ReturnType<typeof createStore>;
const fallbackStore = createStore();
const FullHistoryInterestsContext =
  createContext<FullHistoryInterestsStore | null>(null);

/** Viewer-local registry shared by the playback shell and mounted tiles. */
export const FullHistoryInterestsProvider: React.FC<{
  readonly children: React.ReactNode;
}> = ({ children }) => {
  const [store] = useState(createStore);

  return (
    <FullHistoryInterestsContext.Provider value={store}>
      {children}
    </FullHistoryInterestsContext.Provider>
  );
};

/**
 * Publishes one tile's full-history demand for one feature. The registry keeps
 * the stream in its union until every tile that selected it has released it.
 */
export function usePublishFullHistoryStreams(
  feature: FullHistoryFeature,
  streams: readonly string[],
): void {
  const tileId = useTileId();
  const store = useContext(FullHistoryInterestsContext);
  const normalized = useMemo(() => {
    if (streams.length === 0) return EMPTY_STREAMS;
    return [...new Set(streams)].sort();
  }, [streams]);

  useEffect(() => {
    if (!tileId || !store) return undefined;
    const interestKey = `${feature}\0${tileId}`;
    const interest = { feature, streams: normalized } as const;
    store.set(interestsByTileAtom, (previous) => {
      const next = new Map(previous);
      if (normalized.length === 0) next.delete(interestKey);
      else next.set(interestKey, interest);
      return next;
    });
    return () => {
      store.set(interestsByTileAtom, (previous) => {
        if (previous.get(interestKey) !== interest) return previous;
        const next = new Map(previous);
        next.delete(interestKey);
        return next;
      });
    };
  }, [feature, normalized, store, tileId]);
}

/** Returns every feature's current stream union with one store subscription. */
export function useFullHistoryStreamsByFeature(): ReadonlyMap<
  FullHistoryFeature,
  readonly string[]
> {
  const store = useContext(FullHistoryInterestsContext);
  const streamsByFeature = useAtomValue(streamsByFeatureAtom, {
    store: store ?? fallbackStore,
  });
  return store ? streamsByFeature : EMPTY_STREAMS_BY_FEATURE;
}

/** Returns the sorted stream union currently demanded for one feature. */
export function useFullHistoryStreams(
  feature: FullHistoryFeature,
): readonly string[] {
  return useFullHistoryStreamsByFeature().get(feature) ?? EMPTY_STREAMS;
}
