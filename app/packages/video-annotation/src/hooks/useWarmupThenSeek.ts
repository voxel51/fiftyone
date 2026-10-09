/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useEffect } from "react";
import { usePlayback } from "@fiftyone/playback";

/** A stream that can prefetch the chunk containing a given stream time. */
interface Warmupable {
  warmup(time: number): Promise<void>;
}

/**
 * Warm up the chunk containing `time`, then `seek` to it once the warmup
 * resolves. The engine's `seek` only commits when every blocking stream is
 * already ready, so without the warmup the seek queues silently and the first
 * paint stays blank until the user presses play; with it, content paints as
 * soon as the first chunk lands.
 *
 * Pass the stream from a construct-once ref (stable identity) so the effect
 * runs once per registration.
 *
 * `time` may be a getter (also of stable identity) for a position that moves
 * while the warmup is in flight, such as the playhead: it is read once to
 * pick the chunk and again to seek when the warmup lands.
 */
export function useWarmupThenSeek(
  stream: Warmupable | null,
  time: number | (() => number) = 0,
): void {
  const { seek } = usePlayback();

  useEffect(() => {
    if (!stream) {
      return undefined;
    }

    const read = typeof time === "function" ? time : () => time;
    let cancelled = false;
    void stream.warmup(read()).then(() => {
      if (!cancelled) {
        seek(read());
      }
    });

    return () => {
      cancelled = true;
    };
  }, [stream, seek, time]);
}
