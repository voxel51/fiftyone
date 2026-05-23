import React, { createContext, useContext, useMemo, useState } from "react";

/**
 * Shared "currently selected annotation" key across all annotation
 * surfaces in one MCAP modal (camera image overlays + lidar 3D boxes).
 * Clicking a primitive on any surface sets this key; each overlay
 * highlights only the primitive whose own key matches. Selecting on
 * one surface therefore implicitly deselects whatever was selected on
 * the other.
 *
 * Selection keys are opaque strings — each overlay generates its own
 * (e.g. line-list groups keyed by bounds fingerprint, SceneUpdate cubes
 * keyed by `entityId#cubeIndex`). They're disjoint by construction so
 * the single string is sufficient.
 */
interface McapAnnotationSelectionContextValue {
  readonly selectedKey: string | null;
  readonly setSelectedKey: (next: string | null) => void;
}

const McapAnnotationSelectionContext =
  createContext<McapAnnotationSelectionContextValue>({
    selectedKey: null,
    setSelectedKey: () => undefined,
  });

export const McapAnnotationSelectionProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const value = useMemo(
    () => ({ selectedKey, setSelectedKey }),
    [selectedKey]
  );
  return (
    <McapAnnotationSelectionContext.Provider value={value}>
      {children}
    </McapAnnotationSelectionContext.Provider>
  );
};

export function useMcapAnnotationSelection(): McapAnnotationSelectionContextValue {
  return useContext(McapAnnotationSelectionContext);
}
