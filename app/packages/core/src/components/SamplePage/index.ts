/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { createContext, useContext } from "react";

/**
 * Carries a grid tile into the sample page. The app provides it; the grid
 * only hands over the tile it opens.
 */
export interface SampleTransition {
  /** Lifts a still of `tile` above the app, then opens. */
  open<T>(tile: Element | null, open: () => T): T;
}

export const SampleTransitionContext = createContext<
  SampleTransition | undefined
>(undefined);

export const useSampleTransition = () => useContext(SampleTransitionContext);

/**
 * Where the App is between the grid and a sample's page. `opening` and
 * `closing` have the page over the App while it reveals or leaves; `open` has
 * the App behind it gone.
 */
export type SamplePagePhase = "grid" | "opening" | "open" | "closing";
