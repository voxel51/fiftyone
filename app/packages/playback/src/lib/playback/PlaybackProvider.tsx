import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { PlaybackStoreContext } from "./playback-store-context";
import type {
  PlaybackConfig,
  PlaybackContextValue,
  TimelineMode,
} from "./types";
import { usePublishPauseHandle } from "./pause-handle";
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
 * How the timeline's shared clock is *presented* — the domain ruler ticks,
 * the playhead readout and the loop-bound readouts render in.
 *
 * Seeded from `PlaybackConfig.mode` at mount, then owned by the user: the
 * playhead readout is a button that swaps between the configured mode and
 * plain elapsed `duration` (see {@link useTimelineModeControl}). Only
 * presentation moves — the engine's clock domain and its `stepInterval`
 * stay pinned to the configured mode, so stepping is still one frame per
 * press while the ruler reads seconds.
 *
 * This is Context rather than a Jotai atom because it's per-tree UI state
 * for a bounded subtree, not global state (see CODING_STANDARDS.md).
 */
const TimelineModeContext = createContext<TimelineMode>(DEFAULT_MODE);

/** Toggle affordance over {@link TimelineModeContext}. */
export interface TimelineModeControl {
  /** The mode display surfaces are currently rendering in. */
  mode: TimelineMode;
  /**
   * The provider's configured mode — what the engine's clock math uses, and
   * the mode {@link toggle} returns to from `duration`.
   */
  configuredMode: TimelineMode;
  /**
   * Whether there is a second mode to switch to. False when the provider was
   * configured for `duration` in the first place: with no frame rate (or
   * epoch anchor) there's no other domain to show.
   */
  canToggle: boolean;
  /** Swap between the configured mode and plain elapsed `duration`. */
  toggle(): void;
  /** Set the display mode outright. */
  setMode(mode: TimelineMode): void;
}

const NOOP_MODE_CONTROL: TimelineModeControl = {
  mode: DEFAULT_MODE,
  configuredMode: DEFAULT_MODE,
  canToggle: false,
  toggle: () => undefined,
  setMode: () => undefined,
};

const TimelineModeControlContext =
  createContext<TimelineModeControl>(NOOP_MODE_CONTROL);

/**
 * How the timeline's shared clock is presented to consumers.
 * Most components should use `useTimelineDisplay()` (in `timeline-display.ts`)
 * instead of reading this directly.
 */
export function useMode(): TimelineMode {
  return useContext(TimelineModeContext);
}

/**
 * Read and change the display mode — for the readout that lets the user
 * switch the timeline between frame numbers and elapsed time. Outside a
 * `PlaybackProvider` this reports `duration` and no ability to toggle,
 * rather than throwing, so a readout can render unconditionally.
 */
export function useTimelineModeControl(): TimelineModeControl {
  return useContext(TimelineModeControlContext);
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

  // Reachable from outside this provider — the modal's action bar is a
  // sibling of the media container, not a descendant. See `pause-handle`.
  usePublishPauseHandle(baseContext.pause);

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
  defaultDisplay = "configured",
  seekFetchDebounceMs,
}: PlaybackConfig & { children: React.ReactNode }) {
  // Frozen at mount to match `usePlaybackEngine`'s mount-scoped store: that
  // store's `resolvedStepInterval` (derived from `mode`) is captured once in
  // a `useMemo(() => ..., [])`, so a later `mode` prop change without a
  // remount would otherwise drive the engine from a mode its own
  // mode-dependent state hasn't seen. A caller that needs a new *engine*
  // mode must remount the provider (e.g. keyed on the resolved mode, as
  // `SourcePlayback` does). Switching how the clock is *displayed* needs no
  // remount — that's `displayMode` below.
  const resolvedModeRef = useRef<TimelineMode>();
  if (resolvedModeRef.current === undefined) {
    resolvedModeRef.current = normalizeTimelineMode(mode ?? DEFAULT_MODE);
  }
  const resolvedMode = resolvedModeRef.current;

  // What the ruler / readouts render in. Seeded from the configured mode —
  // or from plain elapsed time when the surface asks for that — and then
  // owned by the user; the engine never reads it. Frozen at mount like
  // `resolvedMode`, so this only ever picks the opening domain.
  const initialDisplayModeRef = useRef<TimelineMode>();
  if (initialDisplayModeRef.current === undefined) {
    initialDisplayModeRef.current =
      defaultDisplay === "duration" ? DEFAULT_MODE : resolvedMode;
  }
  const [displayMode, setDisplayMode] = useState<TimelineMode>(
    initialDisplayModeRef.current,
  );
  const canToggleMode = resolvedMode.kind !== "duration";
  const toggleMode = useCallback(() => {
    if (!canToggleMode) return;
    setDisplayMode((current) =>
      current.kind === "duration" ? resolvedMode : DEFAULT_MODE,
    );
  }, [canToggleMode, resolvedMode]);
  const modeControl = useMemo<TimelineModeControl>(
    () => ({
      mode: displayMode,
      configuredMode: resolvedMode,
      canToggle: canToggleMode,
      toggle: toggleMode,
      setMode: setDisplayMode,
    }),
    [displayMode, resolvedMode, canToggleMode, toggleMode],
  );
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
    <TimelineModeControlContext.Provider value={modeControl}>
      <TimelineModeContext.Provider value={displayMode}>
        <PlaybackStoreContext.Provider value={store}>
          <PlaybackContextHost baseContext={contextValue}>
            {children}
          </PlaybackContextHost>
        </PlaybackStoreContext.Provider>
      </TimelineModeContext.Provider>
    </TimelineModeControlContext.Provider>
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
