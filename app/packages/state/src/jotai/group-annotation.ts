import { type PrimitiveAtom } from "jotai";
import { atomWithDefault, atomWithStorage } from "jotai/utils";
import { createDatasetKeyedStorage, parseDatasetNameFromUrl } from "./utils";

/**
 * Snapshot of group visibility settings and slice captured before entering Annotate mode.
 * Used to restore settings when returning to Explore mode.
 */
export interface GroupVisibilityConfigSnapshot {
  main: boolean;
  carousel: boolean;
  threeDViewer: boolean;
  slice: string | null;
}

/**
 * Stores the visibility settings snapshot from before entering Annotate mode.
 */
export const explorerVisibilitySnapshot: PrimitiveAtom<GroupVisibilityConfigSnapshot | null> =
  atomWithDefault<GroupVisibilityConfigSnapshot | null>(() => null);

/**
 * Persisted annotation slice selection for grouped datasets.
 * Stored per-dataset in localStorage. The component should validate
 * this value against available slices.
 */
export const groupAnnotationSlice = atomWithStorage<string | null>(
  "annotationSlice",
  null,
  createDatasetKeyedStorage<string | null>(parseDatasetNameFromUrl)
);
