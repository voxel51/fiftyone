// ---------------------------------------------------------------------------
// Core types for the continuous-time playback engine (distinct from the frame-number
// based timeline in use-timeline.ts / state.ts).
// ---------------------------------------------------------------------------

import type { IconName } from "@voxel51/voodo";
import type { createStore } from "jotai";
import type { ComponentType } from "react";

/** Opaque handle to the scoped Jotai store owned by a PlaybackProvider instance. */
export type PlaybackStore = ReturnType<typeof createStore>;

// ---------------------------------------------------------------------------
// Buffer readiness
// ---------------------------------------------------------------------------

/**
 * Three-state readiness for a target time:
 * - "ready"   — data is loaded and renderable.
 * - "loading" — fetch is already in flight; engine waits without re-requesting.
 * - "missing" — no fetch started; engine calls prefetch() on this stream.
 */
export type BufferReadiness = "ready" | "loading" | "missing";

// ---------------------------------------------------------------------------
// Selection policy
// ---------------------------------------------------------------------------

/**
 * How a stream resolves the best cached entry for a requested time:
 * - "nearest"         — closest entry in either direction, within threshold.
 * - "nearestPrevious" — closest entry at or before the requested time, within
 *                       threshold. Use this when showing a future frame early
 *                       would be incorrect (e.g. a sensor read that hasn't
 *                       happened yet).
 */
export type SelectionPolicy = "nearest" | "nearestPrevious";

export interface StreamLookupPolicy {
  type: SelectionPolicy;
  /**
   * Maximum distance in seconds between the requested time and a cached entry
   * for the entry to be considered a valid match. Entries further away are
   * treated as not present.
   */
  thresholdSeconds: number;
}

// ---------------------------------------------------------------------------
// Stream interface
// ---------------------------------------------------------------------------

/**
 * A data stream that the playback engine is aware of. Streams are registered
 * dynamically (mount/unmount) and the engine consults blocking streams
 * before advancing the playhead.
 *
 * Most streams should extend `PlaybackStreamBase`, which provides defaults
 * and wires `onCommit` into the `streamValueAtom(id)` family automatically.
 * The interface below is the raw contract — extend the base unless you need
 * full control.
 *
 * **Subscriber lifecycle:** A registered stream is *dormant* until at least
 * one consumer subscribes via `useStream(id)`. Dormant streams are skipped
 * entirely by the engine — `bufferState` and `prefetch` are not called, and
 * blocking dormant streams do NOT stall the clock. This avoids fetching data
 * nothing is rendering.
 */
export interface PlaybackStream {
  /** Unique identifier within a playback instance. */
  id: string;

  /**
   * When true, the clock will not advance until bufferState returns "ready"
   * for the target time. Non-blocking streams never stall the clock; they
   * still receive prefetch() calls but the engine doesn't wait on them.
   *
   * All streams share the single playheadAtom — if a blocking stream
   * stalls the clock, non-blocking streams freeze too.
   */
  blocking: boolean;

  /**
   * Total duration of this stream's data in seconds, if known. The engine
   * derives `durationAtom` from the max of every registered stream's
   * duration, so the timeline's length follows whichever stream has the
   * most content. Omit (or leave `undefined`) for streams whose extent
   * isn't known yet — re-register the stream once it is.
   */
  duration?: number;

  /**
   * Native sample period in seconds — e.g. 1/30 for 30 fps video, 0.1
   * for 10 Hz sensor data. The engine derives `stepIntervalAtom` from
   * the *min* across registered streams, so stepForward / stepBack lands
   * on a tick that even the highest-frequency stream can resolve.
   */
  nativeStepSeconds?: number;

  /**
   * How many seconds ahead of the target time this stream wants to keep
   * buffered. Passed as the upper bound of the range in prefetch() calls.
   * @default 3
   */
  lookaheadSeconds?: number;

  /**
   * How this stream resolves the best cached entry for a given time. Used
   * both in bufferState (to determine readiness) and in onCommit (to pick
   * the data to push to the reactive atom). Use resolveAtTime() from
   * `utils.ts::resolveAtTime` to implement both consistently.
   */
  lookupPolicy?: StreamLookupPolicy;

  /**
   * Called by the RAF loop every tick. Must be cheap — runs at display
   * refresh rate. Must not allocate or trigger React state updates.
   */
  bufferState: (time: number) => BufferReadiness;

  /**
   * Called by the engine when bufferState returns "missing" for a blocking
   * stream. The range is [targetTime, targetTime + lookaheadSeconds].
   * The stream decides how to fetch — the engine just signals the need.
   * Not called when bufferState is "loading" (fetch already in flight).
   */
  prefetch?: (range: [number, number]) => void;

  /**
   * Called by the engine after each committed tick — i.e. after
   * currentTimeAtom has advanced. The stream should resolve the best
   * cached entry for `time` using its lookupPolicy and write it to its own
   * reactive Jotai atom so consumers re-render with fresh data.
   *
   * All onCommit calls for a given tick are synchronous. React 18 batches
   * the resulting atom updates into a single render pass, so multiple streams
   * do not cause multiple re-renders.
   */
  onCommit?: (time: number, store: PlaybackStore) => void;

  /**
   * Returns the currently buffered time ranges for this stream.
   * Used by the timeline track UI to render a buffer progress bar.
   * Optional — omit if the stream has no meaningful buffer to display.
   */
  bufferedRanges?: () => Array<[number, number]>;

  /**
   * Optional tile metadata so a `TilingHeader` (or any UI surface that
   * spawns tiles) can list this stream as an addable tile. Streams
   * without this entry are still valid — they just won't appear in
   * tile-add menus.
   */
  tile?: PlaybackStreamTileMetadata;
}

/**
 * Describes how to render a tile that consumes a particular stream.
 * Streams attach this via `PlaybackStream.tile` so UIs like
 * `TilingHeader` can build their add-tile menu by scanning what's been
 * registered with the engine — no per-story menu wiring required.
 *
 * `kind` is the type discriminator (e.g. `"camera"`): the add-tile menu
 * groups by it, the settings panel filters by it (so a camera tile's
 * source picker only lists camera streams), and tile components can
 * key behavior off it.
 *
 * `title` is the per-source label ("Camera front", "IMU"). `kindLabel`
 * is the menu label shared across all streams of the same kind
 * ("Camera", "IMU").
 */
export interface PlaybackStreamTileMetadata {
  /** Type discriminator for source/menu grouping. */
  kind: string;
  /** Menu label, shared across all streams of the same `kind`. */
  kindLabel: string;
  /** Per-source display name (used in the settings source picker). */
  title: string;
  /** Menu item icon. */
  icon: IconName;
  /** Tile body component, mounted as `<Tile />` when a new tile spawns. */
  Tile: ComponentType;
}

// ---------------------------------------------------------------------------
// Config passed to PlaybackProvider
// ---------------------------------------------------------------------------

export interface PlaybackConfig {
  /**
   * Fallback duration when no registered stream provides one. The engine
   * always sets `durationAtom = max(this, max of streams' durations)`, so
   * streams override this once they register. Useful for demos / stories
   * that want a meaningful timeline before any real data wires up.
   * @default 0
   */
  duration?: number;
  /**
   * Fallback step size in seconds. The engine derives `stepIntervalAtom`
   * from `min(this, every registered stream's `nativeStepSeconds`)`, so
   * step size tracks the highest-frequency stream by default. Provide
   * this only as a sensible floor for the case where no stream
   * publishes a `nativeStepSeconds`.
   * @default 1/30
   */
  stepInterval?: number;
  defaultLoopStart?: number;
  defaultLoopEnd?: number;
  /** Initial playback speed multiplier. @default 1.0 */
  defaultSpeed?: number;
}

// ---------------------------------------------------------------------------
// What the context exposes to consumers
// ---------------------------------------------------------------------------

export interface PlaybackContextValue {
  duration: number;
  stepInterval: number;

  // Actions — stable references, safe to put in dependency arrays.
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  stepBack: () => void;
  stepForward: () => void;
  setView: (start: number, end: number) => void;
  setLoop: (start: number, end: number) => void;
  setSpeed: (speed: number) => void;

  /**
   * Register a stream with the playback engine. Returns a cleanup function
   * that deregisters it — use as the return value of a useEffect.
   *
   * Registering with an id that already exists replaces the entry in-place
   * so the RAF loop always calls the latest closures without a remount cycle.
   *
   * Registration alone does NOT activate the stream — at least one consumer
   * must subscribe via `useStream(id)` before the engine starts driving it.
   */
  registerStream: (stream: PlaybackStream) => () => void;

  /**
   * Increment the subscriber count for a stream. Returns an unsubscribe
   * function that decrements it. When the count is zero the stream is
   * dormant and the engine skips it.
   *
   * Most consumers should use `useStream(id)` instead of calling this
   * directly — the hook handles subscribe/unsubscribe in a useEffect.
   */
  subscribeStream: (id: string) => () => void;
}
