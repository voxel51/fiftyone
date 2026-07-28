import { useTileId } from "@fiftyone/tiling";
import { atom, createStore, useAtomValue } from "jotai";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const EMPTY_TOPICS: readonly string[] = [];
const topicsByTileAtom = atom<ReadonlyMap<string, readonly string[]>>(
  new Map(),
);
const selectedTopicsAtom = atom((get) =>
  [
    ...new Set([...get(topicsByTileAtom).values()].flatMap((value) => value)),
  ].sort(),
);
type McapAnnotationTopicsStore = ReturnType<typeof createStore>;
const fallbackStore = createStore();
const McapAnnotationTopicsContext =
  createContext<McapAnnotationTopicsStore | null>(null);

/** Viewer-local registry shared by the host and its mounted MCAP tiles. */
export const McapAnnotationTopicsProvider: React.FC<{
  readonly children: React.ReactNode;
}> = ({ children }) => {
  const [store] = useState(createStore);

  return (
    <McapAnnotationTopicsContext.Provider value={store}>
      {children}
    </McapAnnotationTopicsContext.Provider>
  );
};

/** Publishes one tile's resolved annotation topics for neutral extensions. */
export function usePublishMcapAnnotationTopics(
  topics: readonly string[],
): void {
  const tileId = useTileId();
  const store = useContext(McapAnnotationTopicsContext);
  const topicsKey = [...new Set(topics)].sort().join("\0");
  const normalized = useMemo(
    () => (topicsKey ? topicsKey.split("\0") : EMPTY_TOPICS),
    [topicsKey],
  );

  // This effect publishes the tile's current topics and removes only the
  // snapshot owned by this effect instance during cleanup.
  useEffect(() => {
    if (!tileId || !store) return undefined;
    store.set(topicsByTileAtom, (previous) => {
      const next = new Map(previous);
      if (normalized.length === 0) next.delete(tileId);
      else next.set(tileId, normalized);
      return next;
    });
    return () => {
      store.set(topicsByTileAtom, (previous) => {
        if (previous.get(tileId) !== normalized) return previous;
        const next = new Map(previous);
        next.delete(tileId);
        return next;
      });
    };
  }, [normalized, store, tileId]);
}

/** Returns the sorted annotation-topic union for the current MCAP viewer. */
export function useMcapSelectedAnnotationTopics(): readonly string[] {
  const store = useContext(McapAnnotationTopicsContext);
  const topics = useAtomValue(selectedTopicsAtom, {
    store: store ?? fallbackStore,
  });
  return store ? topics : EMPTY_TOPICS;
}
