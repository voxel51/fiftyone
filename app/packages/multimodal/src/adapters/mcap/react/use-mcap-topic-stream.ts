import { useStreamValue } from "@fiftyone/playback";
import { useEffect } from "react";
import { useMcapDataStream } from "./mcap-data-stream-context";

/**
 * Tile-side hook: subscribes to one MCAP topic and returns its current frame.
 *
 * Calling this hook tells the data stream that the topic has an active
 * consumer. The data stream includes it in batch fetches and excludes it
 * when the tile is closed (subscriber count drops to zero).
 *
 * Uses `useStreamValue` rather than `useStream` because activation is
 * per-topic through the data stream — all topics ride one engine-level
 * stream that stays subscribed for the modal's lifetime.
 *
 * Returns `null` until the first frame is committed for this topic.
 */
export function useMcapTopicStream<T = unknown>(topic: string): T | null {
  const dataStream = useMcapDataStream();

  useEffect(() => {
    if (!topic || !dataStream) return undefined;
    return dataStream.subscribeToTopic(topic);
  }, [topic, dataStream]);

  return useStreamValue<T>(topic);
}
