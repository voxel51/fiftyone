import { Provider as JotaiProvider } from "jotai";
import React, { createContext, useContext } from "react";
import type { PlaybackConfig, PlaybackContextValue } from "./playback-types";
import { usePlaybackEngine } from "./use-playback-engine";

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

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
      <PlaybackContext.Provider value={contextValue}>
        {children}
      </PlaybackContext.Provider>
    </JotaiProvider>
  );
}

/**
 * Access playback actions and registerStream from anywhere inside a
 * PlaybackProvider. Does NOT subscribe to any atom — calling this does
 * not cause re-renders when time changes.
 */
export function usePlayback(): PlaybackContextValue {
  const ctx = useContext(PlaybackContext);
  if (!ctx) throw new Error("usePlayback must be used inside <PlaybackProvider>");
  return ctx;
}
