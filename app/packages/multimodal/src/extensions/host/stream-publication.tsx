import { atom, createStore, useAtomValue } from "jotai";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const EMPTY_STREAMS: readonly string[] = [];

/** Creates one viewer-local registry for mounted stream publishers. */
export function createStreamPublication() {
  const streamsByPublisherAtom = atom<ReadonlyMap<string, readonly string[]>>(
    new Map(),
  );
  const publishedStreamsAtom = atom((get) =>
    [
      ...new Set(
        [...get(streamsByPublisherAtom).values()].flatMap((value) => value),
      ),
    ].sort(),
  );
  type PublicationStore = ReturnType<typeof createStore>;
  const fallbackStore = createStore();
  const PublicationContext = createContext<PublicationStore | null>(null);

  const Provider: React.FC<{ readonly children: React.ReactNode }> = ({
    children,
  }) => {
    const [store] = useState(createStore);
    return (
      <PublicationContext.Provider value={store}>
        {children}
      </PublicationContext.Provider>
    );
  };

  const usePublishStreams = (
    publisherId: string | null,
    streams: readonly string[],
  ): void => {
    const store = useContext(PublicationContext);
    const streamsKey = [...new Set(streams.filter(Boolean))].sort().join("\0");
    const normalized = useMemo(
      () => (streamsKey ? streamsKey.split("\0") : EMPTY_STREAMS),
      [streamsKey],
    );

    // This effect binds the current stream snapshot to exactly one publisher.
    useEffect(() => {
      if (!publisherId || !store) return undefined;
      store.set(streamsByPublisherAtom, (previous) => {
        const next = new Map(previous);
        if (normalized.length === 0) next.delete(publisherId);
        else next.set(publisherId, normalized);
        return next;
      });
      return () => {
        store.set(streamsByPublisherAtom, (previous) => {
          if (previous.get(publisherId) !== normalized) return previous;
          const next = new Map(previous);
          next.delete(publisherId);
          return next;
        });
      };
    }, [normalized, publisherId, store]);
  };

  const usePublishedStreams = (): readonly string[] => {
    const store = useContext(PublicationContext);
    const streams = useAtomValue(publishedStreamsAtom, {
      store: store ?? fallbackStore,
    });
    return store ? streams : EMPTY_STREAMS;
  };

  return { Provider, usePublishedStreams, usePublishStreams } as const;
}
