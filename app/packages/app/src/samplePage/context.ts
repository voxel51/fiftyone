/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { createContext, useContext } from "react";
import type { AppSampleTransition } from "./transition";

const AppSampleTransitionContext = createContext<
  AppSampleTransition | undefined
>(undefined);

export const AppSampleTransitionProvider = AppSampleTransitionContext.Provider;

/** The sample page's transition, which `Sync` creates for the whole App. */
export const useAppSampleTransition = () => {
  const transition = useContext(AppSampleTransitionContext);
  if (!transition) throw new Error("no sample transition in the tree");
  return transition;
};
