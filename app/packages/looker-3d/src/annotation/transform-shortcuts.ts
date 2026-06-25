import type { Archetype3d } from "../types";
import { isDetection3dOverlay, isPolyline3dOverlay } from "../types";
import type { SelectedPoint, TransformMode } from "./types";

type GetSelectedTransformArchetypeOptions = {
  currentArchetypeSelectedForTransform: Archetype3d | null;
  isAnnotationPlaneEnabled?: boolean;
  selectedLabelForAnnotation: unknown;
  selectedPoint?: SelectedPoint | null;
};

export const getSelectedLabelTransformArchetype = (
  selectedLabelForAnnotation: unknown
): Archetype3d | null => {
  if (isDetection3dOverlay(selectedLabelForAnnotation)) {
    return "cuboid";
  }

  if (isPolyline3dOverlay(selectedLabelForAnnotation)) {
    return "polyline";
  }

  return null;
};

export const getSelectedTransformArchetype = ({
  currentArchetypeSelectedForTransform,
  isAnnotationPlaneEnabled = false,
  selectedLabelForAnnotation,
  selectedPoint = null,
}: GetSelectedTransformArchetypeOptions): Archetype3d | null => {
  const selectedLabelArchetype = getSelectedLabelTransformArchetype(
    selectedLabelForAnnotation
  );

  if (currentArchetypeSelectedForTransform === "point") {
    return selectedPoint ? "point" : selectedLabelArchetype;
  }

  if (currentArchetypeSelectedForTransform === "annotation-plane") {
    return isAnnotationPlaneEnabled
      ? "annotation-plane"
      : selectedLabelArchetype;
  }

  if (
    currentArchetypeSelectedForTransform === "cuboid" ||
    currentArchetypeSelectedForTransform === "polyline"
  ) {
    return currentArchetypeSelectedForTransform === selectedLabelArchetype
      ? currentArchetypeSelectedForTransform
      : selectedLabelArchetype;
  }

  return selectedLabelArchetype;
};

export const canTransformArchetypeUseMode = (
  archetype: Archetype3d | null,
  mode: TransformMode
) => {
  if (!archetype) {
    return false;
  }

  if (archetype === "cuboid") {
    return true;
  }

  if (archetype === "annotation-plane") {
    return mode !== "scale";
  }

  return mode === "translate";
};
