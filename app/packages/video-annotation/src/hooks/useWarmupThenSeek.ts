/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useEffect, useRef } from "react";
import {
  getIsPlaying,
  getIsPlayPending,
  getPlayhead,
  usePlayback,
  usePlaybackStore,
  useSeekEvent,
} from "@fiftyone/playback";

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
 * A supplied opening time makes the host own startup: null waits for its
 * scope to resolve, and subsequent user playback takes precedence. Omitting
 * it preserves the annotation surface's initial label-paint kick at zero.
 */
export function useWarmupThenSeek(
  stream: Warmupable | null,
  time?: number | null | (() => number),
): void {
  const { seek } = usePlayback();
  const store = usePlaybackStore();
  const seekEvent = useSeekEvent();
  const hasSought = useRef(false);
  if (seekEvent) hasSought.current = true;

  useEffect(() => {
    if (!stream || time === null) {
      return undefined;
    }

    const read = typeof time === "function" ? time : () => time;
    let cancelled = false;
    const target = read() ?? 0;
    void stream.warmup(target).then(() => {
      // Late scope/label data must not undo a scrub or a press of Play.
      if (
        !cancelled &&
        (typeof time === "function" ||
          ((time === undefined || !hasSought.current) &&
            getPlayhead(store) === 0 &&
            !getIsPlaying(store) &&
            !getIsPlayPending(store)))
      ) {
        seek(read() ?? 0);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [stream, seek, time, store]);
}
