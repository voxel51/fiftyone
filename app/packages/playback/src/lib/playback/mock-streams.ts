// ---------------------------------------------------------------------------
// Mock stream implementations — useful for tests and Storybook stories.
// These are the simplest possible objects satisfying PlaybackStream.
// ---------------------------------------------------------------------------

import type { PlaybackStream } from "./types";

/** Always ready. Use in UI tests that don't care about buffering. */
export function makeReadyStream(id: string, blocking = true): PlaybackStream {
  return { id, blocking, bufferState: () => "ready" };
}

/**
 * Always "loading" (stuck waiting). Use to test the buffering/spinner UI.
 * Returns "loading" (not "missing") so the engine won't call prefetch on it.
 */
export function makeBufferingStream(id: string, blocking = true): PlaybackStream {
  return { id, blocking, bufferState: () => "loading" };
}

/**
 * Returns "missing" for all times. Use to test that the engine calls prefetch.
 */
export function makeMissingStream(
  id: string,
  blocking = true,
  onPrefetch?: (range: [number, number]) => void
): PlaybackStream {
  return {
    id,
    blocking,
    bufferState: () => "missing",
    prefetch: onPrefetch,
  };
}

/**
 * Ready only within [readyStart, readyEnd]. Times outside that range are
 * "missing" — the engine will call prefetch when blocked on them.
 */
export function makeWindowedStream(
  id: string,
  readyStart: number,
  readyEnd: number,
  blocking = true
): PlaybackStream {
  return {
    id,
    blocking,
    bufferState: (time) =>
      time >= readyStart && time <= readyEnd ? "ready" : "missing",
  };
}

/**
 * Simulates a stream with a rolling ready window around a head position.
 * Call updateHead (e.g. from a seekEvent subscriber) to reposition the window.
 * Times before head or beyond head + windowSeconds are "missing".
 *
 * In a real stream, updateHead would kick off an async fetch; here it's
 * synchronous so tests don't need to await anything.
 */
export function makeRollingWindowStream(
  id: string,
  windowSeconds = 3,
  blocking = true
): PlaybackStream & { updateHead: (time: number) => void } {
  let head = 0;
  return {
    id,
    blocking,
    lookaheadSeconds: windowSeconds,
    bufferState: (time) =>
      time >= head && time <= head + windowSeconds ? "ready" : "missing",
    updateHead: (time) => {
      head = time;
    },
  };
}
