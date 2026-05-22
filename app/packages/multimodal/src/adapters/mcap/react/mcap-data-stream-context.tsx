import React, {
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";

/**
 * The handle a tile body uses to subscribe to MCAP topic data. The
 * data stream (`useRegisterMcapDataStream`) publishes this into the
 * surrounding `McapDataStreamProvider` once it has caches in place;
 * tiles read it via `useMcapDataStream()`.
 */
export interface McapDataStream {
  /** Mark this topic active. The returned cleanup decrements the
   *  subscriber count; the topic's cache + held last-frame are
   *  released when the count reaches zero. */
  readonly subscribeToTopic: (topic: string) => () => void;
}

interface McapDataStreamContextValue {
  readonly dataStream: McapDataStream | null;
  readonly setDataStream: (next: McapDataStream | null) => void;
}

// Default setter is a no-op so reading the context outside the provider
// is harmless — the real setter comes from `McapDataStreamProvider`.
const noopSetter: (next: McapDataStream | null) => void = () => undefined;

const McapDataStreamContext = createContext<McapDataStreamContextValue>({
  dataStream: null,
  setDataStream: noopSetter,
});

/**
 * Wraps the MCAP-aware part of the tree (MultiModalPlayback + every
 * tile body) so the setup hook and the topic-subscribe hook share the
 * same `McapDataStream` handle without going through an atom.
 */
export const McapDataStreamProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [dataStream, setDataStream] = useState<McapDataStream | null>(null);
  const value = useMemo(
    () => ({ dataStream, setDataStream }),
    [dataStream]
  );
  return (
    <McapDataStreamContext.Provider value={value}>
      {children}
    </McapDataStreamContext.Provider>
  );
};

/** Read the published `McapDataStream` handle. `null` until the setup
 *  hook has finished registering caches. */
export function useMcapDataStream(): McapDataStream | null {
  return useContext(McapDataStreamContext).dataStream;
}

/** Setter used by the setup hook to publish its handle. */
export function useSetMcapDataStream(): (
  next: McapDataStream | null
) => void {
  return useContext(McapDataStreamContext).setDataStream;
}
