import React, { createContext, useContext, useMemo, useRef } from "react";
import { PlaybackStoreContext } from "./playback-store-context";
import type {
  PlaybackConfig,
  PlaybackContextValue,
  TimelineMode,
} from "./types";
import { useDuration, useStepInterval } from "./use-playback-state";
import { usePlaybackEngine } from "./use-playback-engine";

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

const DEFAULT_MODE: TimelineMode = { kind: "duration" };

/**
 * Falls back to `duration` mode when a caller-provided `TimelineMode`'s
 * numeric fields can't produce a sane conversion — a non-finite/non-positive
 * `sequence.fps` would make `stepInterval` (and every frame conversion)
 * `Infinity`/`NaN`/`0`; a non-finite `absolute.epochAnchorMs` would make
 * every converted timestamp an Invalid Date. Validated once here so every
 * consumer (the engine's stepInterval fallback, `TimelineModeContext`,
 * ruler tick math) sees only sane values.
 */
function normalizeTimelineMode(mode: TimelineMode): TimelineMode {
  switch (mode.kind) {
    case "sequence":
      return Number.isFinite(mode.fps) && mode.fps > 0 ? mode : DEFAULT_MODE;
    case "absolute":
      return Number.isFinite(mode.epochAnchorMs) ? mode : DEFAULT_MODE;
    default:
      return mode;
  }
}

/**
 * How the timeline's shared clock is presented to and driven by consumers.
 * Static for the lifetime of the provider — set once from
 * `PlaybackConfig.mode` when `PlaybackProvider` mounts. This is Context
 * rather than a Jotai atom because it's static-ish config for a bounded
 * tree, not reactive global state (see CODING_STANDARDS.md).
 */
const TimelineModeContext = createContext<TimelineMode>(DEFAULT_MODE);

/**
 * How the timeline's shared clock is presented to and driven by consumers.
 * Most components should use `useTimelineDisplay()` (in `timeline-display.ts`)
 * instead of reading this directly.
 */
export function useMode(): TimelineMode {
  return useContext(TimelineModeContext);
}

/**
 * Reads the live duration / stepInterval (which our reactive hooks pull
 * from the playback store via the explicit-store context) and overlays
 * them on the static base context. Without this `usePlayback()` would
 * be locked to the provider's prop fallbacks and never reflect what
 * registered streams report.
 */
function PlaybackContextHost({
  baseContext,
  children,
}: {
  baseContext: PlaybackContextValue;
  children: React.ReactNode;
}) {
  const liveDuration = useDuration();
  const liveStepInterval = useStepInterval();
  const value = useMemo<PlaybackContextValue>(
    () => ({
      ...baseContext,
      duration: liveDuration,
      stepInterval: liveStepInterval,
    }),
    [baseContext, liveDuration, liveStepInterval],
  );
  return (
    <PlaybackContext.Provider value={value}>
      {children}
    </PlaybackContext.Provider>
  );
}

export function PlaybackProvider({
  children,
  duration,
  stepInterval,
  defaultLoopStart,
  defaultLoopEnd,
  defaultSpeed = 1.0,
  snapToFrameOnSettle,
  mode,
  seekFetchDebounceMs,
}: PlaybackConfig & { children: React.ReactNode }) {
  // Frozen at mount to match `usePlaybackEngine`'s mount-scoped store: that
  // store's `resolvedStepInterval` (derived from `mode`) is captured once in
  // a `useMemo(() => ..., [])`, so a later `mode` prop change without a
  // remount would otherwise update this context while the engine's
  // mode-dependent state stays stale. A caller that needs a new mode must
  // remount the provider (e.g. keyed on the resolved mode, as
  // `SourcePlayback` does).
  const resolvedModeRef = useRef<TimelineMode>();
  if (resolvedModeRef.current === undefined) {
    resolvedModeRef.current = normalizeTimelineMode(mode ?? DEFAULT_MODE);
  }
  const resolvedMode = resolvedModeRef.current;
  const { store, contextValue } = usePlaybackEngine({
    duration,
    stepInterval,
    defaultLoopStart,
    defaultLoopEnd,
    defaultSpeed,
    snapToFrameOnSettle,
    mode: resolvedMode,
    seekFetchDebounceMs,
  });

  // We deliberately do NOT mount a Jotai `<Provider>` here. Every reactive
  // read in this package goes through `usePlaybackStore()` and targets
  // this store explicitly via `useAtomValue(atom, { store })`, so the
  // Jotai-context "nearest provider wins" lookup never enters the
  // picture. A nested `<JotaiProvider>` from another package (e.g.
  // TilingProvider) used to shadow the playback store and silently
  // route every read to the wrong atoms — that's the bug this avoids.
  return (
    <TimelineModeContext.Provider value={resolvedMode}>
      <PlaybackStoreContext.Provider value={store}>
        <PlaybackContextHost baseContext={contextValue}>
          {children}
        </PlaybackContextHost>
      </PlaybackStoreContext.Provider>
    </TimelineModeContext.Provider>
  );
}

/**
 * Access playback actions, `registerStream`, and the live duration from
 * anywhere inside a PlaybackProvider. The returned `duration` reflects the
 * current `durationAtom` value (max of registered streams' durations, or
 * the provider's fallback), so consumers will re-render when streams that
 * change duration register or unregister.
 */
export function usePlayback(): PlaybackContextValue {
  const ctx = useContext(PlaybackContext);
  if (!ctx)
    throw new Error("usePlayback must be used inside <PlaybackProvider>");
  return ctx;
}

export { usePlaybackStore } from "./playback-store-context";
