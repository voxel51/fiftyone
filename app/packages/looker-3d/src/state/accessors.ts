import {
  useRecoilState,
  useRecoilValue,
  useResetRecoilState,
  useSetRecoilState,
} from "recoil";
import {
  activeCursorPanelAtom,
  cuboidLabelLineWidthAtom,
  current3dAnnotationModeAtom,
  currentArchetypeSelectedForTransformAtom,
  fo3dPerformanceStatsAtom,
  hoveredLabelAtom,
  isActivelySegmentingSelector,
  isCreatingCuboidAtom,
  isFo3dMainPanelPointerDownAtom,
  mainPanelPanSyncIntentAtom,
  mainPanelZoomSyncIntentAtom,
  polylineLabelLineWidthAtom,
  raycastResultAtom,
  selectedLabelForAnnotationAtom,
  showCuboidOrientationAtom,
  transformModeAtom,
} from "./recoil";

/**
 * Hook to retrieve the current 3D annotation mode.
 *
 * @returns The current annotation mode, or null if no mode is active
 */
export const useCurrent3dAnnotationMode = () => {
  const mode = useRecoilValue(current3dAnnotationModeAtom);

  return mode;
};

/**
 * Hook to set the current 3D annotation mode.
 *
 * @returns A function that accepts the annotation mode to set
 */
export const useSetCurrent3dAnnotationMode = () => {
  const setMode = useSetRecoilState(current3dAnnotationModeAtom);

  return setMode;
};

/**
 * Hook to reset the 3D annotation mode to null.
 *
 * @returns A function that resets the annotation mode when called
 */
export const useReset3dAnnotationMode = () => {
  const reset3dAnnotationMode = useResetRecoilState(
    current3dAnnotationModeAtom,
  );

  return reset3dAnnotationMode;
};

/**
 * Hook to retrieve the label currently selected for 3D annotation.
 *
 * @returns The selected label, or null if nothing is selected
 */
export const useCurrentSelected3dAnnotationLabel = () => {
  return useRecoilValue(selectedLabelForAnnotationAtom);
};

/**
 * Hook to reset the selected 3D annotation label to null.
 *
 * @returns A function that clears the selection when called
 */
export const useResetSelected3dAnnotationLabel = () => {
  return useResetRecoilState(selectedLabelForAnnotationAtom);
};

/**
 * Hook to retrieve the currently hovered 3D label in annotation mode.
 *
 * @returns The hovered label identifier (`{ id }`) or null if no label is hovered
 */
export const useHoveredLabel3d = () => {
  return useRecoilValue(hoveredLabelAtom);
};

export const useFo3dPerformanceStats = () => {
  return useRecoilValue(fo3dPerformanceStatsAtom);
};

export const useSetFo3dPerformanceStats = () => {
  return useSetRecoilState(fo3dPerformanceStatsAtom);
};

export const useCuboidOrientation = () => {
  return useRecoilValue(showCuboidOrientationAtom);
};

export const useCuboidOrientationState = () => {
  return useRecoilState(showCuboidOrientationAtom);
};

export const useActiveCursorPanel = () => {
  return useRecoilValue(activeCursorPanelAtom);
};

export const useSetActiveCursorPanel = () => {
  return useSetRecoilState(activeCursorPanelAtom);
};

export const useFo3dMainPanelPointerDown = () => {
  return useRecoilValue(isFo3dMainPanelPointerDownAtom);
};

export const useSetFo3dMainPanelPointerDown = () => {
  return useSetRecoilState(isFo3dMainPanelPointerDownAtom);
};

export const useGlobalCursorCoordinatorActions = () => {
  return {
    setActiveCursorPanel: useSetActiveCursorPanel(),
    setIsMainPanelPointerDown: useSetFo3dMainPanelPointerDown(),
  };
};

export const useRaycastResult = () => {
  return useRecoilValue(raycastResultAtom);
};

export const useSetRaycastResult = () => {
  return useSetRecoilState(raycastResultAtom);
};

export const useMainPanelNavigationSyncIntents = () => {
  return {
    mainPanelPanSyncIntent: useRecoilValue(mainPanelPanSyncIntentAtom),
    mainPanelZoomSyncIntent: useRecoilValue(mainPanelZoomSyncIntentAtom),
  };
};

export const useMainPanelNavigationSyncEmitterState = () => {
  return {
    activeCursorPanel: useRecoilValue(activeCursorPanelAtom),
    raycastResult: useRecoilValue(raycastResultAtom),
    setMainPanelPanSyncIntent: useSetRecoilState(mainPanelPanSyncIntentAtom),
    setMainPanelZoomSyncIntent: useSetRecoilState(mainPanelZoomSyncIntentAtom),
  };
};

export const useCuboidTransformCommands = () => {
  const setCurrentArchetypeSelectedForTransform = useSetRecoilState(
    currentArchetypeSelectedForTransformAtom,
  );
  const setTransformMode = useSetRecoilState(transformModeAtom);

  return {
    selectNewCuboidForTransform: () => {
      setCurrentArchetypeSelectedForTransform("cuboid");
    },
    setTransformMode,
  };
};

export const useThreeDLabelState = () => {
  const [cuboidLineWidth, setCuboidLineWidth] = useRecoilState(
    cuboidLabelLineWidthAtom,
  );
  const [polylineWidth, setPolylineWidth] = useRecoilState(
    polylineLabelLineWidthAtom,
  );

  return {
    cuboidLineWidth,
    hoveredLabel: useHoveredLabel3d(),
    isCreatingCuboid: useRecoilValue(isCreatingCuboidAtom),
    isSegmenting: useRecoilValue(isActivelySegmentingSelector),
    polylineWidth,
    selectedLabelForAnnotation: useCurrentSelected3dAnnotationLabel(),
    setCuboidLineWidth,
    setPolylineWidth,
    showCuboidOrientation: useCuboidOrientation(),
  };
};
