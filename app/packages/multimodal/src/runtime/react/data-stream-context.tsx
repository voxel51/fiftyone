import React, { createContext, useContext, useMemo, useState } from "react";
import type { AnyEpisodeDataStream, EpisodeDataStream } from "../data-stream";

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
export function useEpisodeDataStream<
  TFrame = unknown,
  TCache = unknown,
>(): EpisodeDataStream<TFrame, TCache> | null {
  return useContext(DataStreamContext).dataStream as EpisodeDataStream<
    TFrame,
    TCache
  > | null;
}

/** Returns the setter used by runtime setup to publish a stream handle. */
export function useSetEpisodeDataStream<TFrame = unknown, TCache = unknown>(): (
  next: EpisodeDataStream<TFrame, TCache> | null,
) => void {
  return useContext(DataStreamContext).setDataStream;
}
