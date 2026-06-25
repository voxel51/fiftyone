import * as fos from "@fiftyone/state";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { PANEL_ID_MAIN } from "../constants";
import { useFo3dContext } from "../fo3d/context";
import {
  annotationPlaneAtom,
  cuboidCreationStateAtom,
  hoveredLabelAtom,
  isFo3dMainPanelPointerDownAtom,
  isFo3dPointCropModifierPressedAtom,
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
import { isHoverEligibleForPointCloudCrop } from "./point-cloud-crop-eligibility";
import { useRenderModel } from "./store";

interface UsePointCloudCropOptions {
  enabled?: boolean;
}

const CUBOID_CREATION_CROP_ID = "cuboid-creation-preview";

export const usePointCloudCrop = ({
  enabled = true,
}: UsePointCloudCropOptions = {}) => {
  const mode = fos.useModalMode();
  const { pluginSettings, pointCloudSettings, upVector } = useFo3dContext();
  const selectedLabel = useRecoilValue(selectedLabelForAnnotationAtom);
  const hoveredLabel = useRecoilValue(hoveredLabelAtom);
  const isPointCropModifierPressed = useRecoilValue(
    isFo3dPointCropModifierPressedAtom
  );
  const isMainPanelPointerDown = useRecoilValue(isFo3dMainPanelPointerDownAtom);
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

    if (
      isHoverEligibleForPointCloudCrop(hoveredLabel, isMainPanelPointerDown)
    ) {
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
    }

    if (
      mode === "annotate" &&
      !isMainPanelPointerDown &&
      isPointCropModifierPressed &&
      raycastResult.sourcePanel === PANEL_ID_MAIN &&
      raycastResult.isPointCloud &&
      raycastResult.worldPosition
    ) {
      const raycastHoverCrop = createPointCloudCropFromPoint(
        raycastResult.worldPosition,
        {
          margin,
          source: "raycast-hover",
          upVector,
          visibleWorldHeightAtPoint: raycastResult.visibleWorldHeightAtPoint,
        }
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
    hoveredLabel?.source,
    isMainPanelPointerDown,
    isPointCropModifierPressed,
    margin,
    mode,
    raycastResult.isPointCloud,
    raycastResult.sourcePanel,
    raycastResult.visibleWorldHeightAtPoint,
    raycastResult.worldPosition,
    renderModel,
    selectedLabel?._id,
    upVector,
    useLegacyCoordinates,
  ]);
};
