import React, { createContext, useContext, useMemo, useState } from "react";
import type { McapFrameTransformsState } from "./use-mcap-frame-transforms";

const missingResolve: McapFrameTransformsState["resolve"] = (
  sourceFrameId,
  targetFrameId,
) => ({
  sourceFrameId,
  status: "missing",
  targetFrameId,
});

const IDLE_FRAME_TRANSFORMS: McapFrameTransformsState = {
  error: null,
  frameIds: [],
  resolve: missingResolve,
  status: "idle",
};

interface McapFrameTransformsContextValue {
  readonly frameTransforms: McapFrameTransformsState;
  readonly setFrameTransforms: (state: McapFrameTransformsState) => void;
}

const McapFrameTransformsContext =
  createContext<McapFrameTransformsContextValue | null>(null);

/**
 * Shares the active MCAP transform resolver with tile bodies. The provider
 * lives outside the playback shell; a bridge inside the shell updates it once
 * the current playhead time and source-specific resource client are available.
 */
export const McapFrameTransformsProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [frameTransforms, setFrameTransforms] =
    useState<McapFrameTransformsState>(IDLE_FRAME_TRANSFORMS);
  const value = useMemo(
    () => ({ frameTransforms, setFrameTransforms }),
    [frameTransforms],
  );

  return (
    <McapFrameTransformsContext.Provider value={value}>
      {children}
    </McapFrameTransformsContext.Provider>
  );
};

/**
 * Reads the current MCAP frame transform resolver state.
 */
export function useMcapFrameTransformsContext(): McapFrameTransformsState {
  return useContextValue().frameTransforms;
}

/**
 * Updates the shared MCAP frame transform resolver state.
 */
export function useSetMcapFrameTransformsContext(): (
  state: McapFrameTransformsState,
) => void {
  return useContextValue().setFrameTransforms;
}

/**
 * Shared idle state used by bridge cleanup.
 */
export function idleMcapFrameTransformsState(): McapFrameTransformsState {
  return IDLE_FRAME_TRANSFORMS;
}

function useContextValue(): McapFrameTransformsContextValue {
  const value = useContext(McapFrameTransformsContext);
  if (!value) {
    throw new Error(
      "MCAP frame transforms must be used inside <McapFrameTransformsProvider>",
    );
  }

  return value;
}
