/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useEffect } from "react";
import { usePlayback } from "../../../playback/src/lib/playback/PlaybackProvider";

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
 */
export function useWarmupThenSeek(stream: Warmupable | null, time = 0): void {
  const { seek } = usePlayback();

  useEffect(() => {
    if (!stream) {
      return undefined;
    }

    let cancelled = false;
    void stream.warmup(time).then(() => {
      if (!cancelled) {
        seek(time);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [stream, seek, time]);
}
