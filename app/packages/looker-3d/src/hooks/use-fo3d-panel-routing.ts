import * as fos from "@fiftyone/state";
import { isInMultiPanelViewAtom } from "@fiftyone/state";
import { useEffect, useMemo } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { annotationPlaneAtom } from "../state";
import { RenderPath } from "../types";

interface UseFo3dPanelRoutingArgs {
  mode: string;
  canAnnotate: boolean;
  isSceneReady: boolean;
  recomputeBounds: () => void;
}

/**
 * Selects main vs multi-panel rendering and syncs panel routing side effects.
 */
export const useFo3dPanelRouting = ({
  mode,
  canAnnotate,
  isSceneReady,
  recomputeBounds,
}: UseFo3dPanelRoutingArgs) => {
  const is2DSampleViewerVisible = useRecoilValue(
    fos.groupMediaIsMain2DViewerVisible
  );
  const isGroup = useRecoilValue(fos.isGroup);
  const isAnnotationPlaneEnabled = useRecoilValue(annotationPlaneAtom).enabled;
  const setIsInMultiPanelView = useSetRecoilState(isInMultiPanelViewAtom);

  const shouldRenderMultiPanelView = useMemo(
    () =>
      mode === fos.ModalMode.ANNOTATE &&
      canAnnotate &&
      !(isGroup && is2DSampleViewerVisible) &&
      isSceneReady,
    [mode, canAnnotate, isGroup, is2DSampleViewerVisible, isSceneReady]
  );

  const currentRenderPath: RenderPath = shouldRenderMultiPanelView
    ? "multi"
    : "main";

  // This effect recomputes bounds when multi-panel visibility inputs change.
  useEffect(() => {
    if (shouldRenderMultiPanelView) {
      recomputeBounds();
    }
  }, [shouldRenderMultiPanelView, isAnnotationPlaneEnabled, recomputeBounds]);

  // This effect syncs global panel view state with the current routing mode.
  useEffect(() => {
    setIsInMultiPanelView(shouldRenderMultiPanelView);
  }, [setIsInMultiPanelView, shouldRenderMultiPanelView]);

  return {
    shouldRenderMultiPanelView,
    currentRenderPath,
  };
};
