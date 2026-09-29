/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { createContext, useContext } from "react";

/**
 * Carries a grid tile into the sample page: the grid hands over the tile it
 * opened, the page lands it on its media, and the ghost leaves once the page
 * shows. The app provides it; the grid only calls `open`.
 */
export interface SampleTransition {
  /** Lifts a still of `tile` above the app, then opens. */
  open<T>(tile: Element | null, open: () => T): T;
  /** Flies the lifted still onto `page`'s media; resolves when it is there. */
  land(page: HTMLElement): Promise<void>;
  /** Removes the still once the page shows its media, or at once. */
  settle(page?: HTMLElement): void;
}

export const SampleTransitionContext = createContext<
  SampleTransition | undefined
>(undefined);

export const useSampleTransition = () => useContext(SampleTransitionContext);

/**
 * Where the dataset body is between the grid and a sample's page: `opening`
 * has the page mounted over the grid while it reveals, `open` has the grid
 * gone.
 */
export type SamplePagePhase = "grid" | "opening" | "open";
