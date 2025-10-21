import { editing as editingAtom } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state";
import type { AnnotationLabel } from "@fiftyone/state";
import { atom, useAtom } from "jotai";
import { useEffect } from "react";
import { useRecoilState } from "recoil";
import { polylinePointTransformsAtom } from "../state";
import { applyTransformsToPolyline } from "./utils/polyline-utils";

export const useSyncPolylinesWithSidebar = () => {
  const [polylinePointTransforms] = useRecoilState(polylinePointTransformsAtom);
  const [editing, setEditing] = useAtom(editingAtom);

  useEffect(() => {
    if (Object.keys(polylinePointTransforms).length === 0) return;

    // Sync polyline transforms with sidebar when they change
    for (const [labelId, transforms] of Object.entries(
      polylinePointTransforms
    )) {
      if (transforms.length === 0) continue;

      // Apply transforms to get effective points
      const effectivePoints = applyTransformsToPolyline([], transforms);

      // convert effective points to polyline label data
      const polylineLabelData = {
        _id: labelId,
        points: [],
        points3d: effectivePoints,
        filled: false,
        closed: false,
        label: `Polyline ${labelId.substring(0, 8)}`,
      };

      // Create a mock overlay object for the 3D polyline
      const mockOverlay = {
        id: labelId,
        setSelected: () => {},
        setHovered: () => {},
        dispatchSafely: () => {},
      };

      // Create an atom for the polyline label and set it to editing
      const polylineLabelAtom = atom<AnnotationLabel>({
        isNew: false,
        data: polylineLabelData,
        // Todo: remove hardcoded path
        path: "roads",
        // path: field,
        type: "Polyline" as const,
        overlay: mockOverlay,
      });

      setEditing(polylineLabelAtom);

      return () => {
        setEditing(null);
      };
    }
  }, [polylinePointTransforms]);
};
