import { useTileId } from "@fiftyone/tiling";
import { atom, createStore, useAtomValue } from "jotai";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const EMPTY_STREAMS: readonly string[] = [];
const streamsByTileAtom = atom<ReadonlyMap<string, readonly string[]>>(
  new Map(),
);
const selectedStreamsAtom = atom((get) =>
  [
    ...new Set([...get(streamsByTileAtom).values()].flatMap((value) => value)),
  ].sort(),
);
type AnnotationStreamsStore = ReturnType<typeof createStore>;
const fallbackStore = createStore();
const AnnotationStreamsContext = createContext<AnnotationStreamsStore | null>(
  null,
);

/** Viewer-local registry shared by the host and its mounted episode tiles. */
export const AnnotationStreamsProvider: React.FC<{
  readonly children: React.ReactNode;
}> = ({ children }) => {
  const [store] = useState(createStore);

  return (
    <AnnotationStreamsContext.Provider value={store}>
      {children}
    </AnnotationStreamsContext.Provider>
  );
};

/** Publishes one tile's resolved annotation streams for neutral extensions. */
export function usePublishAnnotationStreams(streams: readonly string[]): void {
  const tileId = useTileId();
  const store = useContext(AnnotationStreamsContext);
  const streamsKey = [...new Set(streams)].sort().join("\0");
  const normalized = useMemo(
    () => (streamsKey ? streamsKey.split("\0") : EMPTY_STREAMS),
    [streamsKey],
  );

  // This effect publishes the tile's current streams and removes only the
  // snapshot owned by this effect instance during cleanup.
  useEffect(() => {
    if (!tileId || !store) return undefined;
    store.set(streamsByTileAtom, (previous) => {
      const next = new Map(previous);
      if (normalized.length === 0) next.delete(tileId);
      else next.set(tileId, normalized);
      return next;
    });
    return () => {
      store.set(streamsByTileAtom, (previous) => {
        if (previous.get(tileId) !== normalized) return previous;
        const next = new Map(previous);
        next.delete(tileId);
        return next;
      });
    };
  }, [normalized, store, tileId]);
}

/** Returns the sorted annotation-stream union for the current episode viewer. */
export function useSelectedAnnotationStreams(): readonly string[] {
  const store = useContext(AnnotationStreamsContext);
  const streams = useAtomValue(selectedStreamsAtom, {
    store: store ?? fallbackStore,
  });
  return store ? streams : EMPTY_STREAMS;
}
