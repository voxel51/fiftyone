import React, { createContext, useContext, useMemo, useState } from "react";
import type { DecodedFrame } from "../ir";
import type { TimelineIndex } from "./timeline-index";

/** Minimum identity required for a source-scoped runtime data stream. */
export interface SourceScopedDataStream {
  readonly sourceKey: string;
}

/** Format-neutral data stream published to episode tile consumers. */
export interface EpisodeDataStream<
  TFrame = DecodedFrame,
  TCache = unknown,
> extends SourceScopedDataStream {
  readonly getStreamCache: (stream: string) => TCache | undefined;
  readonly getTimelineIndex: () => TimelineIndex | null;
  readonly readStreamFrames?: (request: {
    readonly endTimeNs: bigint;
    readonly startTimeNs: bigint;
    readonly stream: string;
  }) => Promise<readonly TFrame[]>;
  readonly subscribeToStream: (stream: string) => () => void;
}

/** Erased frame/cache specialization stored by the shared runtime context. */
export type AnyEpisodeDataStream = EpisodeDataStream<unknown, unknown>;

interface DataStreamContextValue {
  readonly dataStream: AnyEpisodeDataStream | null;
  readonly setDataStream: (next: AnyEpisodeDataStream | null) => void;
}

const noopSetter: (next: AnyEpisodeDataStream | null) => void = () => undefined;

const DataStreamContext = createContext<DataStreamContextValue>({
  dataStream: null,
  setDataStream: noopSetter,
});

/** Publishes one source-scoped stream handle to the shared episode shell. */
export const EpisodeDataStreamProvider: React.FC<{
  readonly children: React.ReactNode;
  readonly expectedSourceKey?: string | null;
}> = ({ children, expectedSourceKey }) => {
  const [dataStream, setDataStream] = useState<AnyEpisodeDataStream | null>(
    null,
  );
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
    <DataStreamContext.Provider value={value}>
      {children}
    </DataStreamContext.Provider>
  );
};

/** Reads the format-neutral episode stream handle, if one is published. */
export function useEpisodeDataStream(): AnyEpisodeDataStream | null {
  return useContext(DataStreamContext).dataStream;
}

/** Returns the setter used by runtime setup to publish a stream handle. */
export function useSetEpisodeDataStream(): (
  next: AnyEpisodeDataStream | null,
) => void {
  return useContext(DataStreamContext).setDataStream;
}
