import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AnyEpisodeDataStream, DataStream } from "../data-stream";

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
export const DataStreamProvider: React.FC<{
  readonly children: React.ReactNode;
  readonly expectedSourceKey?: string | null;
  /** Logical session owner; separate episodes can share the same byte source. */
  readonly expectedOwner?: object | null;
}> = ({ children, expectedSourceKey, expectedOwner }) => {
  const [published, setPublished] = useState<{
    dataStream: AnyEpisodeDataStream | null;
    owner: object | null | undefined;
  }>({ dataStream: null, owner: undefined });
  const ownerRef = useRef(expectedOwner);
  ownerRef.current = expectedOwner;
  const setDataStream = useCallback(
    (next: AnyEpisodeDataStream | null) => {
      if (ownerRef.current !== expectedOwner) return;
      setPublished({ dataStream: next, owner: expectedOwner });
    },
    [expectedOwner],
  );
  const { dataStream } = published;
  const visibleDataStream =
    (expectedSourceKey === undefined ||
      dataStream?.sourceKey === expectedSourceKey) &&
    (expectedOwner === undefined || published.owner === expectedOwner)
      ? dataStream
      : null;
  const value = useMemo(
    () => ({ dataStream: visibleDataStream, setDataStream }),
    [visibleDataStream, setDataStream],
  );
  return (
    <DataStreamContext.Provider value={value}>
      {children}
    </DataStreamContext.Provider>
  );
};

/** Reads the format-neutral episode stream handle, if one is published. */
export function useDataStream<TFrame = unknown, TCache = unknown>(): DataStream<
  TFrame,
  TCache
> | null {
  return useContext(DataStreamContext).dataStream as DataStream<
    TFrame,
    TCache
  > | null;
}

/** Returns the setter used by runtime setup to publish a stream handle. */
export function useSetDataStream<TFrame = unknown, TCache = unknown>(): (
  next: DataStream<TFrame, TCache> | null,
) => void {
  return useContext(DataStreamContext).setDataStream;
}
