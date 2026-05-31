import React, { createContext, useContext, useMemo } from "react";
import { PlaybackStoreContext } from "./playback-store-context";
import type { PlaybackConfig, PlaybackContextValue } from "./types";
import { useDuration, useStepInterval } from "./use-playback-state";
import { usePlaybackEngine } from "./use-playback-engine";

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

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
    [baseContext, liveDuration, liveStepInterval]
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
}: PlaybackConfig & { children: React.ReactNode }) {
  const { store, contextValue } = usePlaybackEngine({
    duration,
    stepInterval,
    defaultLoopStart,
    defaultLoopEnd,
    defaultSpeed,
    snapToFrameOnSettle,
  });

  // We deliberately do NOT mount a Jotai `<Provider>` here. Every reactive
  // read in this package goes through `usePlaybackStore()` and targets
  // this store explicitly via `useAtomValue(atom, { store })`, so the
  // Jotai-context "nearest provider wins" lookup never enters the
  // picture. A nested `<JotaiProvider>` from another package (e.g.
  // TilingProvider) used to shadow the playback store and silently
  // route every read to the wrong atoms — that's the bug this avoids.
  return (
    <PlaybackStoreContext.Provider value={store}>
      <PlaybackContextHost baseContext={contextValue}>
        {children}
      </PlaybackContextHost>
    </PlaybackStoreContext.Provider>
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
