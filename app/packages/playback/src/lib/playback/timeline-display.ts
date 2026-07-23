// ---------------------------------------------------------------------------
// Mode-aware presentation layer over the playback engine's clock (FOEPD-3811).
//
// The engine's internal clock domain never changes: `currentTimeAtom`,
// `playheadAtom`, `seek()`, `setLoop()`, `setView()` all continue to mean
// "seconds from timeline start," always, regardless of `TimelineMode`. This
// file is the thin conversion layer on top, so ruler labels / scrub inputs /
// loop-bound editors can work in frame numbers or wall-clock timestamps
// without the engine ever exposing anything but seconds.
// ---------------------------------------------------------------------------

import { useCallback, useMemo } from "react";
import { usePlayback } from "./PlaybackProvider";
import { useMode } from "./use-playback-state";
import type { TimelineMode } from "./types";

export interface TimelineDisplayConversion {
  /** Convert internal seconds to the value the UI should render/accept. */
  toDisplay(seconds: number): number | Date;
  /** Convert a UI-facing value back to internal seconds. */
  fromDisplay(value: number | Date): number;
  /**
   * Sequence mode only: true when scrub UI should quantize intermediate
   * drag positions to whole frames as the user drags, rather than staying
   * continuous and only snapping at settle (the `duration`-mode behavior
   * `snapToFrameOnSettle` opts into). There's no such thing as frame 2.5, so
   * mid-drag continuity would show a value the mode can't represent.
   *
   * This is an explicit **design decision, not a validated one** — a UX
   * call made without user testing. Revisit if it feels wrong in practice.
   */
  quantizeDuringScrub: boolean;
}

/**
 * Pure conversion functions for a given `TimelineMode` — no React or store
 * dependency, so this is unit-testable directly and reusable outside a
 * component (e.g. a non-React track-label formatter).
 *
 * Note: `sequence` mode's frame numbering is 0-indexed (frame 0, 1, 2, ...),
 * per the FOEPD-3811 ticket's own example. This is deliberately unrelated
 * to `utils.ts::frameAt`, which is 1-indexed for the existing `/frames`
 * server-query convention — different domain, don't conflate the two.
 */
export function createTimelineDisplayConversion(
  mode: TimelineMode,
): TimelineDisplayConversion {
  switch (mode.kind) {
    case "sequence": {
      const step = 1 / mode.fps;
      return {
        toDisplay: (seconds) => Math.round(seconds / step),
        fromDisplay: (value) => {
          const frame = typeof value === "number" ? value : Number(value);
          // Round defensively — even if a caller passes a fractional
          // "frame", there's no such thing as frame 2.5.
          return Math.round(frame) * step;
        },
        quantizeDuringScrub: true,
      };
    }
    case "absolute": {
      const { epochAnchorMs } = mode;
      return {
        toDisplay: (seconds) => new Date(epochAnchorMs + seconds * 1000),
        fromDisplay: (value) => {
          const ms = value instanceof Date ? value.getTime() : Number(value);
          return (ms - epochAnchorMs) / 1000;
        },
        quantizeDuringScrub: false,
      };
    }
    case "duration":
    default:
      return {
        toDisplay: (seconds) => seconds,
        fromDisplay: (value) =>
          value instanceof Date ? value.getTime() / 1000 : value,
        quantizeDuringScrub: false,
      };
  }
}

export interface TimelineDisplayValue extends TimelineDisplayConversion {
  mode: TimelineMode;
  /** Seek by a display-domain value (frame number / Date / seconds). */
  seekDisplay(value: number | Date): void;
  /**
   * `setLoop` convenience wrapper accepting display-domain bounds — mirrors
   * `setLoop`'s validation (invalid/collapsed windows are silently
   * rejected); see `utils.ts::clampAndValidateBounds`.
   */
  setLoopDisplay(start: number | Date, end: number | Date): void;
  /** `setView` convenience wrapper accepting display-domain bounds. */
  setViewDisplay(start: number | Date, end: number | Date): void;
}

/**
 * Mode-aware presentation layer over the playback engine's always-seconds
 * clock. Components that render or accept timeline positions (ruler labels,
 * scrub inputs, loop/view bound editors) should go through this instead of
 * assuming seconds, so they work unmodified across `duration`, `sequence`,
 * and `absolute` timelines.
 *
 * The play-loop RAF tick and any internal engine code MUST keep using the
 * plain `seek`/`setLoop`/`setView` (seconds) from `usePlayback()` directly —
 * this hook is for human-facing display/input surfaces only.
 */
export function useTimelineDisplay(): TimelineDisplayValue {
  const mode = useMode();
  const { seek, setLoop, setView } = usePlayback();

  const conversion = useMemo(
    () => createTimelineDisplayConversion(mode),
    [mode],
  );

  const seekDisplay = useCallback(
    (value: number | Date) => seek(conversion.fromDisplay(value)),
    [seek, conversion],
  );

  const setLoopDisplay = useCallback(
    (start: number | Date, end: number | Date) =>
      setLoop(conversion.fromDisplay(start), conversion.fromDisplay(end)),
    [setLoop, conversion],
  );

  const setViewDisplay = useCallback(
    (start: number | Date, end: number | Date) =>
      setView(conversion.fromDisplay(start), conversion.fromDisplay(end)),
    [setView, conversion],
  );

  return useMemo(
    () => ({
      mode,
      ...conversion,
      seekDisplay,
      setLoopDisplay,
      setViewDisplay,
    }),
    [mode, conversion, seekDisplay, setLoopDisplay, setViewDisplay],
  );
}
