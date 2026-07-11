import React, { createContext, useContext, useMemo, useState } from "react";
import type { McapTimelineIndex } from "./mcap-timeline-index";
import type { McapTopicCache } from "./mcap-topic-cache";

/**
 * The handle a tile body uses to subscribe to MCAP topic data. The
 * data stream (`useRegisterMcapDataStream`) publishes this into the
 * surrounding `McapDataStreamProvider` once it has caches in place;
 * tiles read it via `useMcapDataStream()`.
 */
export interface McapDataStream {
  /** Stable access key of the byte source backing this stream (empty
   *  until a source is bound). Bakes per-recording identity into
   *  cross-tile cache keys — e.g. the shared image-texture cache — so
   *  entries can never collide across recordings. */
  readonly sourceKey: string;

  /** Mark this topic active. The returned cleanup decrements the
   *  subscriber count; the topic's cache + held last-frame are
   *  released when the count reaches zero. */
  readonly subscribeToTopic: (topic: string) => () => void;

  /** Read access to one topic's decoded message cache. Used by
   *  consumers that need lookahead (e.g. annotation interpolation). */
  readonly getTopicCache: (topic: string) => McapTopicCache | undefined;

  /** Read access to the timeline index — ordered ticks plus
   *  `nearestTick(timeSec)` / `secToNs(timeSec)`. */
  readonly getTimelineIndex: () => McapTimelineIndex | null;
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
  /**
   * When supplied, hides a previously published handle synchronously until it
   * belongs to this source. This lets a persistent UI shell swap recordings
   * without exposing the outgoing source for one effect tick.
   */
  expectedSourceKey?: string | null;
}> = ({ children, expectedSourceKey }) => {
  const [dataStream, setDataStream] = useState<McapDataStream | null>(null);
  const visibleDataStream =
    expectedSourceKey === undefined ||
    dataStream?.sourceKey === expectedSourceKey
      ? dataStream
      : null;
  const value = useMemo(
    () => ({ dataStream: visibleDataStream, setDataStream }),
    [visibleDataStream],
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
export function useSetMcapDataStream(): (next: McapDataStream | null) => void {
  return useContext(McapDataStreamContext).setDataStream;
}
