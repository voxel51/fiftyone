import * as fos from "@fiftyone/state";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { PANEL_ID_MAIN } from "../constants";
import { useFo3dContext } from "../fo3d/context";
import {
  annotationPlaneAtom,
  cuboidCreationStateAtom,
  hoveredLabelAtom,
  isFo3dShiftPressedAtom,
  isCreatingCuboidAtom,
  raycastResultAtom,
  selectedLabelForAnnotationAtom,
} from "../state";
import {
  createPointCloudCropFromCuboidTransform,
  createPointCloudCropFromPoint,
  getLabelPointCloudCrop,
  getSelectedCuboidPointCloudCrop,
} from "../utils/point-cloud-crop";
import { getCuboidCreationPreview } from "./cuboid-creation-preview";
import { useRenderModel } from "./store";

interface UsePointCloudCropOptions {
  enabled?: boolean;
}

const CUBOID_CREATION_CROP_ID = "cuboid-creation-preview";

export const usePointCloudCrop = ({
  enabled = true,
}: UsePointCloudCropOptions = {}) => {
  const mode = fos.useModalMode();
  const { pluginSettings, pointCloudSettings } = useFo3dContext();
  const selectedLabel = useRecoilValue(selectedLabelForAnnotationAtom);
  const hoveredLabel = useRecoilValue(hoveredLabelAtom);
  const isShiftPressed = useRecoilValue(isFo3dShiftPressedAtom);
  const raycastResult = useRecoilValue(raycastResultAtom);
  const isCreatingCuboid = useRecoilValue(isCreatingCuboidAtom);
  const cuboidCreationState = useRecoilValue(cuboidCreationStateAtom);
  const annotationPlane = useRecoilValue(annotationPlaneAtom);
  const renderModel = useRenderModel();
  const margin = pointCloudSettings.selectedCuboidCropMargin;
  const useLegacyCoordinates = pluginSettings?.useLegacyCoordinates;

  const creationPreview = useMemo(() => {
    if (!isCreatingCuboid) {
      return null;
    }

    return getCuboidCreationPreview(cuboidCreationState, annotationPlane);
  }, [annotationPlane, cuboidCreationState, isCreatingCuboid]);

  return useMemo(() => {
    if (!enabled) {
      return null;
    }

    if (creationPreview) {
      return createPointCloudCropFromCuboidTransform(
        CUBOID_CREATION_CROP_ID,
        creationPreview,
        { margin, source: "creation" }
      );
    }

    const hoveredCrop = getLabelPointCloudCrop({
      mode,
      renderModel,
      labelId: hoveredLabel?.id,
      margin,
      useLegacyCoordinates,
    });
    if (hoveredCrop) {
      return hoveredCrop;
    }

    if (
      mode === "annotate" &&
      isShiftPressed &&
      raycastResult.sourcePanel === PANEL_ID_MAIN &&
      raycastResult.isPointCloud &&
      raycastResult.worldPosition
    ) {
      const raycastHoverCrop = createPointCloudCropFromPoint(
        raycastResult.worldPosition,
        { margin, source: "raycast-hover" }
      );

      if (raycastHoverCrop) {
        return raycastHoverCrop;
      }
    }

    return getSelectedCuboidPointCloudCrop({
      mode,
      renderModel,
      selectedLabelId: selectedLabel?._id,
      margin,
      useLegacyCoordinates,
    });
  }, [
    creationPreview,
    enabled,
    hoveredLabel?.id,
    isShiftPressed,
    margin,
    mode,
    raycastResult.isPointCloud,
    raycastResult.sourcePanel,
    raycastResult.worldPosition,
    renderModel,
    selectedLabel?._id,
    useLegacyCoordinates,
  ]);
};
