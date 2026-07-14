import * as fos from "@fiftyone/state";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { PANEL_ID_MAIN } from "../constants";
import { useFo3dContext } from "../fo3d/context";
import { load3dOverlays } from "../labels/loader";
import {
  annotationPlaneAtom,
  cuboidCreationStateAtom,
  isFo3dPointCropModifierPressedAtom,
  isCreatingCuboidAtom,
  useCurrentSelected3dAnnotationLabel,
  useFo3dMainPanelPointerDown,
  useHoveredLabel3d,
  useRaycastResult,
} from "../state";
import { isDetection3dOverlay } from "../types";
import {
  createPointCloudCropFromCuboidTransform,
  createPointCloudCropFromPoint,
  getExploreSelectedCuboidId,
  getCuboidPointCloudCrop,
  getSelectedCuboidPointCloudCrop,
} from "../utils/point-cloud-crop";
import { getCuboidCreationPreview } from "./cuboid-creation-preview";
import { useRenderModel } from "./store";
import type { RenderModel } from "./store/types";

interface UsePointCloudCropOptions {
  enabled?: boolean;
}

const CUBOID_CREATION_CROP_ID = "cuboid-creation-preview";

export const usePointCloudCrop = ({
  enabled = true,
}: UsePointCloudCropOptions = {}) => {
  const mode = fos.useModalMode();
  const { pluginSettings, pointCloudSettings, upVector } = useFo3dContext();
  const selectedLabel = useCurrentSelected3dAnnotationLabel();
  const hoveredLabel = useHoveredLabel3d();
  const selectedLabels = useRecoilValue(fos.selectedLabelMap);
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE }),
  );
  const { activeSampleMap } = fos.useRenderConfig3dState();
  const isPointCropModifierPressed = useRecoilValue(
    isFo3dPointCropModifierPressedAtom,
  );
  const isMainPanelPointerDown = useFo3dMainPanelPointerDown();
  const raycastResult = useRaycastResult();
  const isCreatingCuboid = useRecoilValue(isCreatingCuboidAtom);
  const cuboidCreationState = useRecoilValue(cuboidCreationStateAtom);
  const annotationPlane = useRecoilValue(annotationPlaneAtom);
  const renderModel = useRenderModel();
  const margin = pointCloudSettings.selectedCuboidCropMargin;
  const useLegacyCoordinates = pluginSettings?.useLegacyCoordinates;

  // Explore mode has no working doc, so the crop sources from the on-screen 3D
  // detection overlays of the active sample(s). Annotate mode sources from the
  // working doc (see `cropRenderModel`), so this stays empty there.
  const exploreRenderModel = useMemo<RenderModel>(() => {
    if (mode === fos.ModalMode.ANNOTATE) {
      return { detections: [], polylines: [] };
    }

    const overlays =
      load3dOverlays(activeSampleMap ?? {}, selectedLabels ?? {}, [], schema) ??
      [];

    return {
      detections: overlays.filter(isDetection3dOverlay),
      polylines: [],
    };
  }, [activeSampleMap, mode, schema, selectedLabels]);

  const selectedExploreCuboidId = useMemo(
    () =>
      getExploreSelectedCuboidId({
        renderModel: exploreRenderModel,
        hoveredLabelId: hoveredLabel?.id,
        selectedLabels,
      }),
    [exploreRenderModel, hoveredLabel?.id, selectedLabels],
  );

  // Annotate edits the working doc; explore reads the loaded overlays.
  const cropRenderModel =
    mode === fos.ModalMode.ANNOTATE ? renderModel : exploreRenderModel;
  const selectedCuboidId =
    mode === fos.ModalMode.ANNOTATE
      ? selectedLabel?._id
      : selectedExploreCuboidId;

  const creationPreview = useMemo(() => {
    if (!isCreatingCuboid) {
      return null;
    }

    return getCuboidCreationPreview(cuboidCreationState, annotationPlane);
  }, [annotationPlane, cuboidCreationState, isCreatingCuboid]);

  // Resolve the single active crop by precedence:
  //   1. the cuboid currently being drawn (creation preview),
  //   2. a transient raycast "hover" crop (see below),
  //   3. the currently selected cuboid.
  return useMemo(() => {
    if (!enabled) {
      return null;
    }

    if (creationPreview) {
      return createPointCloudCropFromCuboidTransform(
        CUBOID_CREATION_CROP_ID,
        creationPreview,
        { margin, source: "creation" },
      );
    }

    // Hover-to-crop: while the modifier is held and the cursor is over the main
    // panel (but not dragging the camera), preview the crop under the cursor —
    // the hovered cuboid if there is one, otherwise a box around the hovered
    // point-cloud point.
    if (
      mode === fos.ModalMode.ANNOTATE &&
      !isMainPanelPointerDown &&
      isPointCropModifierPressed &&
      raycastResult.sourcePanel === PANEL_ID_MAIN
    ) {
      const raycastCuboidCrop = getCuboidPointCloudCrop({
        renderModel: cropRenderModel,
        labelId: raycastResult.intersectedLabelId,
        margin,
        source: "raycast-hover",
        useLegacyCoordinates,
        visibleWorldHeightAtCenter: raycastResult.visibleWorldHeightAtPoint,
      });

      if (raycastCuboidCrop) {
        return raycastCuboidCrop;
      }

      if (raycastResult.isPointCloud && raycastResult.worldPosition) {
        const raycastHoverCrop = createPointCloudCropFromPoint(
          raycastResult.worldPosition,
          {
            margin,
            source: "raycast-hover",
            upVector,
            visibleWorldHeightAtPoint: raycastResult.visibleWorldHeightAtPoint,
          },
        );

        if (raycastHoverCrop) {
          return raycastHoverCrop;
        }
      }
    }

    return getSelectedCuboidPointCloudCrop({
      renderModel: cropRenderModel,
      selectedLabelId: selectedCuboidId,
      margin,
      useLegacyCoordinates,
    });
  }, [
    creationPreview,
    enabled,
    isMainPanelPointerDown,
    isPointCropModifierPressed,
    margin,
    mode,
    raycastResult.intersectedLabelId,
    raycastResult.isPointCloud,
    raycastResult.sourcePanel,
    raycastResult.visibleWorldHeightAtPoint,
    raycastResult.worldPosition,
    cropRenderModel,
    selectedCuboidId,
    upVector,
    useLegacyCoordinates,
  ]);
};
