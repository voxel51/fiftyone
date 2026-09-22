import {
  useReverbState,
  useReverbValue,
  useResetReverbState,
  useSetReverbState,
} from "@fiftyone/reverb";
import {
  activeCursorPanelAtom,
  cuboidLabelLineWidthAtom,
  current3dAnnotationModeAtom,
  currentArchetypeSelectedForTransformAtom,
  fo3dPerformanceStatsAtom,
  headingUpEditorHoverAtom,
  headingUpPreviewAtom,
  hoveredHeadingTargetFaceAtom,
  hoveredLabelAtom,
  isActivelySegmentingSelector,
  isCreatingCuboidAtom,
  isCurrentlyTransformingAtom,
  isFo3dMainPanelPointerDownAtom,
  mainPanelPanSyncIntentAtom,
  mainPanelZoomSyncIntentAtom,
  polylineLabelLineWidthAtom,
  raycastResultAtom,
  selectedLabelForAnnotationAtom,
  showCuboidOrientationAtom,
  transformModeAtom,
} from "./atoms";

/**
 * Hook to retrieve the current 3D annotation mode.
 *
 * @returns The current annotation mode, or null if no mode is active
 */
export const useCurrent3dAnnotationMode = () => {
  const mode = useReverbValue(current3dAnnotationModeAtom);

  return mode;
};

/**
 * Hook to set the current 3D annotation mode.
 *
 * @returns A function that accepts the annotation mode to set
 */
export const useSetCurrent3dAnnotationMode = () => {
  const setMode = useSetReverbState(current3dAnnotationModeAtom);

  return setMode;
};

/**
 * Hook to reset the 3D annotation mode to null.
 *
 * @returns A function that resets the annotation mode when called
 */
export const useReset3dAnnotationMode = () => {
  const reset3dAnnotationMode = useResetReverbState(
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
  return useReverbValue(selectedLabelForAnnotationAtom);
};

/**
 * Hook to reset the selected 3D annotation label to null.
 *
 * @returns A function that clears the selection when called
 */
export const useResetSelected3dAnnotationLabel = () => {
  return useResetReverbState(selectedLabelForAnnotationAtom);
};

/**
 * Hook to retrieve the currently hovered 3D label in annotation mode.
 *
 * @returns The hovered label identifier (`{ id }`) or null if no label is hovered
 */
export const useHoveredLabel3d = () => {
  return useReverbValue(hoveredLabelAtom);
};

/**
 * Hook to set the currently hovered 3D label in annotation mode.
 *
 * @returns A function that accepts the new hovered label (or null to clear)
 */
export const useSetHoveredLabel3d = () => {
  return useSetReverbState(hoveredLabelAtom);
};

export const useFo3dPerformanceStats = () => {
  return useReverbValue(fo3dPerformanceStatsAtom);
};

export const useSetFo3dPerformanceStats = () => {
  return useSetReverbState(fo3dPerformanceStatsAtom);
};

/**
 * Whether any label is mid-transform (gizmo drag, face-pull resize, heading
 * drag). Components consume this rather than the atom directly.
 */
export const useIsCurrentlyTransforming = () => {
  return useReverbValue(isCurrentlyTransformingAtom);
};

export const useSetIsCurrentlyTransforming = () => {
  return useSetReverbState(isCurrentlyTransformingAtom);
};

/**
 * The active transform gizmo mode (translate/rotate/scale).
 */
export const useTransformMode = () => {
  return useReverbValue(transformModeAtom);
};

/**
 * The candidate face during a heading drag, shared across panels so the
 * highlight shows wherever the label is drawn.
 */
export const useHoveredHeadingTargetFace = () => {
  return useReverbValue(hoveredHeadingTargetFaceAtom);
};

export const useSetHoveredHeadingTargetFace = () => {
  return useSetReverbState(hoveredHeadingTargetFaceAtom);
};

/**
 * The face being hovered in the sidebar's heading/up face picker, for
 * whichever label owns it — read by the 3D scene to preview a ghost
 * arrow/face highlight and suppress other transform controls while hovered.
 */
export const useHeadingUpPreview = () => {
  return useReverbValue(headingUpPreviewAtom);
};

/**
 * Sets/clears the heading/up hover preview. Callers outside the r3f canvas
 * (the DOM sidebar) reach the 3D scene through this rather than the atom
 * directly, matching the rest of this module's convention.
 */
export const useSetHeadingUpPreview = () => {
  return useSetReverbState(headingUpPreviewAtom);
};

/**
 * Whether the pointer is anywhere over the heading/up editor UI as a whole,
 * for whichever label owns it — read by the 3D scene to suppress the gizmo
 * and face-resize handles without flickering as the pointer crosses gaps
 * between face buttons (see {@link useHeadingUpPreview} for the per-face
 * hover that drives the ghost-arrow preview itself).
 */
export const useHeadingUpEditorHover = () => {
  return useReverbValue(headingUpEditorHoverAtom);
};

export const useSetHeadingUpEditorHover = () => {
  return useSetReverbState(headingUpEditorHoverAtom);
};

export const useCuboidOrientation = () => {
  return useReverbValue(showCuboidOrientationAtom);
};

export const useCuboidOrientationState = () => {
  return useReverbState(showCuboidOrientationAtom);
};

export const useActiveCursorPanel = () => {
  return useReverbValue(activeCursorPanelAtom);
};

export const useSetActiveCursorPanel = () => {
  return useSetReverbState(activeCursorPanelAtom);
};

export const useFo3dMainPanelPointerDown = () => {
  return useReverbValue(isFo3dMainPanelPointerDownAtom);
};

export const useSetFo3dMainPanelPointerDown = () => {
  return useSetReverbState(isFo3dMainPanelPointerDownAtom);
};

export const useGlobalCursorCoordinatorActions = () => {
  return {
    setActiveCursorPanel: useSetActiveCursorPanel(),
    setIsMainPanelPointerDown: useSetFo3dMainPanelPointerDown(),
  };
};

export const useRaycastResult = () => {
  return useReverbValue(raycastResultAtom);
};

export const useSetRaycastResult = () => {
  return useSetReverbState(raycastResultAtom);
};

export const useMainPanelNavigationSyncIntents = () => {
  return {
    mainPanelPanSyncIntent: useReverbValue(mainPanelPanSyncIntentAtom),
    mainPanelZoomSyncIntent: useReverbValue(mainPanelZoomSyncIntentAtom),
  };
};

export const useMainPanelNavigationSyncEmitterState = () => {
  return {
    activeCursorPanel: useReverbValue(activeCursorPanelAtom),
    raycastResult: useReverbValue(raycastResultAtom),
    setMainPanelPanSyncIntent: useSetReverbState(mainPanelPanSyncIntentAtom),
    setMainPanelZoomSyncIntent: useSetReverbState(mainPanelZoomSyncIntentAtom),
  };
};

export const useCuboidTransformCommands = () => {
  const setCurrentArchetypeSelectedForTransform = useSetReverbState(
    currentArchetypeSelectedForTransformAtom,
  );
  const setTransformMode = useSetReverbState(transformModeAtom);

  return {
    selectNewCuboidForTransform: () => {
      setCurrentArchetypeSelectedForTransform("cuboid");
    },
    setTransformMode,
  };
};

export const useThreeDLabelState = () => {
  const [cuboidLineWidth, setCuboidLineWidth] = useReverbState(
    cuboidLabelLineWidthAtom,
  );
  const [polylineWidth, setPolylineWidth] = useReverbState(
    polylineLabelLineWidthAtom,
  );

  return {
    cuboidLineWidth,
    hoveredLabel: useHoveredLabel3d(),
    isCreatingCuboid: useReverbValue(isCreatingCuboidAtom),
    isSegmenting: useReverbValue(isActivelySegmentingSelector),
    polylineWidth,
    selectedLabelForAnnotation: useCurrentSelected3dAnnotationLabel(),
    setCuboidLineWidth,
    setPolylineWidth,
    showCuboidOrientation: useCuboidOrientation(),
  };
};
