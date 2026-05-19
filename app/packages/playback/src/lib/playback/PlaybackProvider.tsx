import { Provider as JotaiProvider } from "jotai";
import React, { createContext, useContext, useMemo } from "react";
import type { PlaybackConfig, PlaybackContextValue } from "./types";
import { useDuration, useStepInterval } from "./use-playback-state";
import { usePlaybackEngine } from "./use-playback-engine";

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

/**
 * Renders the context inside the JotaiProvider so it can subscribe to the
 * stream-derived atoms (`durationAtom`, `stepIntervalAtom`) and surface
 * their live values on the context. Without this inner component
 * `usePlayback()` would be locked to the static prop fallbacks and
 * wouldn't reflect what streams actually report.
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
    <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>
  );
}

export function PlaybackProvider({
  children,
  duration,
  stepInterval,
  defaultLoopStart,
  defaultLoopEnd,
  defaultSpeed = 1.0,
}: PlaybackConfig & { children: React.ReactNode }) {
  const { store, contextValue } = usePlaybackEngine({
    duration,
    stepInterval,
    defaultLoopStart,
    defaultLoopEnd,
    defaultSpeed,
  });

  return (
    <JotaiProvider store={store}>
      <PlaybackContextHost baseContext={contextValue}>
        {children}
      </PlaybackContextHost>
    </JotaiProvider>
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
  if (!ctx) throw new Error("usePlayback must be used inside <PlaybackProvider>");
  return ctx;
}
