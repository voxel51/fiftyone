import type { SavedSubset } from "@fiftyone/state/src/selection";
import { createContext, type ComponentType } from "react";

/** Optional host details for the active subset in the scope picker. */
export const SubsetDetailsContext = createContext<ComponentType<{
  subset: SavedSubset;
}> | null>(null);
