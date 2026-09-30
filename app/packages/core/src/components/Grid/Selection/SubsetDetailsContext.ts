import type { SavedSubset } from "@fiftyone/state/src/selection";
import { createContext, type ComponentType, type ReactNode } from "react";

/** Optional non-interactive host details around the active subset label. */
export const SubsetDetailsContext = createContext<ComponentType<{
  subset: SavedSubset;
  children: ReactNode;
}> | null>(null);
