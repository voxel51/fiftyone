import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { usePlaybackStore } from "../../../../../playback/src/lib/playback/playback-store-context";
import { streamValueAtom } from "../../../../../playback/src/lib/playback/atoms";
import { mcapDataStreamAtom } from "./mcap-atoms";

/**
 * Tile-side hook: subscribes to one MCAP topic and returns its current frame.
 *
 * Calling this hook tells the data stream that the topic has an active
 * consumer. The data stream includes it in batch fetches and excludes it
 * when the tile is closed (subscriber count drops to zero).
 *
 * Returns `null` until the first frame is committed for this topic.
 */
export function useMcapTopicStream<T = unknown>(topic: string): T | null {
  const store = usePlaybackStore();
  const dataStream = useAtomValue(mcapDataStreamAtom, { store });

  useEffect(() => {
    if (!topic || !dataStream) return undefined;
    return dataStream.subscribeToTopic(topic);
  }, [topic, dataStream]);

  return useAtomValue(streamValueAtom(topic), { store }) as T | null;
}
