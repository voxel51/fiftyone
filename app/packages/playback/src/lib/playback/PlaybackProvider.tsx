import { Provider as JotaiProvider, useAtomValue } from "jotai";
import React, { createContext, useContext, useMemo } from "react";
import { durationAtom } from "./atoms";
import type { PlaybackConfig, PlaybackContextValue } from "./types";
import { usePlaybackEngine } from "./use-playback-engine";

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

/**
 * Renders the context inside the JotaiProvider so it can subscribe to
 * `durationAtom` and surface the live (stream-derived) duration on the
 * context. Without this inner component the duration on `usePlayback()`
 * would be the static prop value and wouldn't reflect what streams
 * actually report.
 */
function PlaybackContextHost({
  baseContext,
  children,
}: {
  baseContext: PlaybackContextValue;
  children: React.ReactNode;
}) {
  const liveDuration = useAtomValue(durationAtom);
  const value = useMemo<PlaybackContextValue>(
    () => ({ ...baseContext, duration: liveDuration }),
    [baseContext, liveDuration]
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
