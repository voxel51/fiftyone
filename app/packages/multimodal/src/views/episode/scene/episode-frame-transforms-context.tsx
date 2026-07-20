import React, { createContext, useContext, useMemo, useState } from "react";
import { EMPTY_EPISODE_FRAME_GRAPH_SUMMARY } from "../../../runtime/frame-transforms";
import type { EpisodeFrameTransformsState } from "./use-episode-frame-transforms";

const missingResolve: EpisodeFrameTransformsState["resolve"] = (
  sourceFrameId,
  targetFrameId,
) => ({
  sourceFrameId,
  status: "missing",
  targetFrameId,
});

const IDLE_FRAME_TRANSFORMS: EpisodeFrameTransformsState = {
  error: null,
  frameIds: [],
  getPlacementReadiness: () => ({ frameIds: [], status: "ready" }),
  indexedDynamicRanges: () => [],
  prefetchPlacement: () => undefined,
  resolve: missingResolve,
  status: "idle",
  summarizeGraph: () => EMPTY_EPISODE_FRAME_GRAPH_SUMMARY,
};

interface EpisodeFrameTransformsContextValue {
  readonly frameTransforms: EpisodeFrameTransformsState;
  readonly setFrameTransforms: (state: EpisodeFrameTransformsState) => void;
}

const EpisodeFrameTransformsContext =
  createContext<EpisodeFrameTransformsContextValue | null>(null);

/**
 * Shares the active episode transform resolver with tile bodies. The provider
 * lives outside the playback shell; a bridge inside the shell updates it once
 * the current playhead time and source-specific resource client are available.
 */
export const EpisodeFrameTransformsProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [frameTransforms, setFrameTransforms] =
    useState<EpisodeFrameTransformsState>(IDLE_FRAME_TRANSFORMS);
  const value = useMemo(
    () => ({ frameTransforms, setFrameTransforms }),
    [frameTransforms],
  );

  return (
    <EpisodeFrameTransformsContext.Provider value={value}>
      {children}
    </EpisodeFrameTransformsContext.Provider>
  );
};

/**
 * Reads the current episode frame transform resolver state.
 */
export function useEpisodeFrameTransformsContext(): EpisodeFrameTransformsState {
  return useContextValue().frameTransforms;
}

/**
 * Updates the shared episode frame transform resolver state.
 */
export function useSetEpisodeFrameTransformsContext(): (
  state: EpisodeFrameTransformsState,
) => void {
  return useContextValue().setFrameTransforms;
}

/**
 * Shared idle state used by bridge cleanup.
 */
export function idleEpisodeFrameTransformsState(): EpisodeFrameTransformsState {
  return IDLE_FRAME_TRANSFORMS;
}

function useContextValue(): EpisodeFrameTransformsContextValue {
  const value = useContext(EpisodeFrameTransformsContext);
  if (!value) {
    throw new Error(
      "episode frame transforms must be used inside <EpisodeFrameTransformsProvider>",
    );
  }

  return value;
}
