import {
  getPlayhead,
  subscribePlayhead,
  usePlaybackStore,
} from "@fiftyone/playback";
import { useEffect, useState } from "react";
import { type DataStream, useDataStream } from "./data-stream-context";

/**
 * Current episode timeline tick, in nanoseconds, nearest to the playback playhead.
 */
export function usePlaybackTimeNs(): bigint | undefined {
  const dataStream = useDataStream();
  const store = usePlaybackStore();
  const [timeNs, setTimeNs] = useState<bigint | undefined>(() =>
    currentTimeNs(dataStream, getPlayhead(store)),
  );

  // This effect subscribes to playback changes and republishes the nearest
  // episode timeline tick for transform lookups.
  useEffect(() => {
    const publish = () => {
      setTimeNs((current) => {
        const next = currentTimeNs(dataStream, getPlayhead(store));
        return current === next ? current : next;
      });
    };

    publish();
    return subscribePlayhead(store, publish);
  }, [dataStream, store]);

  return timeNs;
}

function currentTimeNs(
  dataStream: DataStream | null,
  timeSec: number,
): bigint | undefined {
  return dataStream?.getTimelineIndex()?.nearestTick(timeSec);
}
