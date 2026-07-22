import React, { createContext, useContext, useMemo, useState } from "react";
import { EMPTY_EPISODE_FRAME_GRAPH_SUMMARY } from "../../../../runtime/frame-transforms";
import type { FrameTransformsState } from "./use-frame-transforms";

const missingResolve: FrameTransformsState["resolve"] = (
  sourceFrameId,
  targetFrameId,
) => ({
  sourceFrameId,
  status: "missing",
  targetFrameId,
});

const IDLE_FRAME_TRANSFORMS: FrameTransformsState = {
  error: null,
  frameIds: [],
  getPlacementReadiness: () => ({ frameIds: [], status: "ready" }),
  indexedDynamicRanges: () => [],
  prefetchPlacement: () => undefined,
  resolve: missingResolve,
  status: "idle",
  summarizeGraph: () => EMPTY_EPISODE_FRAME_GRAPH_SUMMARY,
};

interface FrameTransformsContextValue {
  readonly frameTransforms: FrameTransformsState;
  readonly setFrameTransforms: (state: FrameTransformsState) => void;
}

const FrameTransformsContext =
  createContext<FrameTransformsContextValue | null>(null);

/**
 * Shares the active episode transform resolver with tile bodies. The provider
 * lives outside the playback shell; a bridge inside the shell updates it once
 * the current playhead time and source-specific resource client are available.
 */
export const FrameTransformsProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [frameTransforms, setFrameTransforms] = useState<FrameTransformsState>(
    IDLE_FRAME_TRANSFORMS,
  );
  const value = useMemo(
    () => ({ frameTransforms, setFrameTransforms }),
    [frameTransforms],
  );

  return (
    <FrameTransformsContext.Provider value={value}>
      {children}
    </FrameTransformsContext.Provider>
  );
};

/**
 * Reads the current episode frame transform resolver state.
 */
export function useFrameTransformsContext(): FrameTransformsState {
  return useContextValue().frameTransforms;
}

/**
 * Updates the shared episode frame transform resolver state.
 */
export function useSetFrameTransformsContext(): (
  state: FrameTransformsState,
) => void {
  return useContextValue().setFrameTransforms;
}

/**
 * Shared idle state used by bridge cleanup.
 */
export function idleFrameTransformsState(): FrameTransformsState {
  return IDLE_FRAME_TRANSFORMS;
}

function useContextValue(): FrameTransformsContextValue {
  const value = useContext(FrameTransformsContext);
  if (!value) {
    throw new Error(
      "episode frame transforms must be used inside <FrameTransformsProvider>",
    );
  }

  return value;
}
