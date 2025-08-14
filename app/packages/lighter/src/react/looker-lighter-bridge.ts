import { BaseState } from "@fiftyone/looker";
import DetectionOverlay from "@fiftyone/looker/src/overlays/detection";
import { BoundingBoxOptions, overlayFactory } from "..";
import { BoundingBoxLabel } from "../overlay/BoundingBoxOverlay";

// todo: this is temporary hack
export const convertLegacyToLighterDetection = (
  overlay: DetectionOverlay<BaseState>,
  sampleId: string
) => {
  // Get relative coordinates [0-1] from the legacy overlay
  const [relativeX, relativeY, relativeWidth, relativeHeight] =
    overlay.label.bounding_box;

  // Create a lighter bounding box with relative coordinates
  // The scene will handle the coordinate transformation automatically
  const lighterOverlay = overlayFactory.create<BoundingBoxOptions>(
    "bounding-box",
    {
      label: overlay.label as BoundingBoxLabel,
      relativeBounds: {
        x: relativeX,
        y: relativeY,
        width: relativeWidth,
        height: relativeHeight,
      },
      draggable: true,
      selectable: true,
      field: overlay.field,
      sampleId,
    }
  );

  return lighterOverlay;
};
