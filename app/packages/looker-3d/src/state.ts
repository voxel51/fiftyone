import { ColorscaleInput } from "@fiftyone/looker/src/state";
import * as fos from "@fiftyone/state";
import {
  getBrowserStorageEffectForKey,
  groupId,
  nullableModalSampleId,
} from "@fiftyone/state";
import { atom, atomFamily, DefaultValue, selector } from "recoil";
import { Vector3 } from "three";
import type {
  AnnotationPlaneState,
  PolylinePointTransformData,
  SegmentState,
  SelectedPoint,
  TransformMode,
  TransformSpace,
} from "./annotation/types";
import { SHADE_BY_HEIGHT } from "./constants";
import type { FoSceneNode } from "./hooks";
import { OverlayLabel } from "./labels/loader";
import type {
  Actions,
  AssetLoadingLog,
  LoadingStatusWithContext,
  ShadeBy,
} from "./types";
import { LoadingStatus, TransformArchetype } from "./types";

// =============================================================================
// GENERAL 3D
// =============================================================================

// ASSET LOADING & PARSING
const fo3dAssetsParseStatusLog = atomFamily<AssetLoadingLog[], string>({
  key: "fo3d-assetsParseStatusLogs",
  default: [],
});

export const fo3dAssetsParseStatusThisSample = selector<AssetLoadingLog[]>({
  key: "fo3d-assetsParseStatusLogsThisSampleSelector",
  get: ({ get }) => {
    const thisModalUniqueId = `${get(groupId) ?? ""}-${get(
      nullableModalSampleId
    )}`;
    return get(fo3dAssetsParseStatusLog(`${thisModalUniqueId}`));
  },
  set: ({ get, set }, newValue) => {
    set(
      fo3dAssetsParseStatusLog(
        `${get(groupId) ?? ""}-${get(nullableModalSampleId)}`
      ),
      newValue
    );
  },
});

const fo3dLoadingStatusLog = atomFamily<LoadingStatusWithContext, string>({
  key: "fo3d-loadingStatus",
  default: {
    status: LoadingStatus.IDLE,
    timestamp: Date.now(),
  },
});

export const fo3dLoadingStatusThisSample = selector<LoadingStatusWithContext>({
  key: "fo3d-loadingStatusThisSampleSelector",
  get: ({ get }) => {
    const thisModalUniqueId = `${get(groupId) ?? ""}-${get(
      nullableModalSampleId
    )}`;
    return get(fo3dLoadingStatusLog(`${thisModalUniqueId}`));
  },
  set: ({ get, set }, newValue) => {
    set(
      fo3dLoadingStatusLog(
        `${get(groupId) ?? ""}-${get(nullableModalSampleId)}`
      ),
      newValue
    );
  },
});

// UI & INTERFACE
export const currentActionAtom = atom<Actions>({
  key: "fo3d-openAction",
  default: null,
});

export const isLevaConfigPanelOnAtom = atom<boolean>({
  key: "fo3d-isLevaConfigPanelOn",
  default: false,
});

export const isStatusBarOnAtom = atom<boolean>({
  key: "fo3d-isStatusBarOn",
  default: false,
});

export const annotationToolbarPositionAtom = atom<number>({
  key: "fo3d-annotationToolbarPosition",
  default: 50,
  effects: [
    getBrowserStorageEffectForKey("fo3d-annotationToolbarPosition", {
      valueClass: "number",
    }),
  ],
});

// GRID & BACKGROUND
export const isGridOnAtom = atom<boolean>({
  key: "fo3d-isGridOn",
  default: true,
  effects: [
    getBrowserStorageEffectForKey("fo3d-isGridOn", {
      valueClass: "boolean",
    }),
  ],
});

export const gridCellSizeAtom = atom<number>({
  key: "fo3d-gridCellSize",
  default: 1,
});

export const gridSectionSizeAtom = atom<number>({
  key: "fo3d-gridSectionSize",
  default: 10,
});

export const isGridInfinitelyLargeAtom = atom<boolean>({
  key: "fo3d-isGridInfinitelyLarge",
  default: true,
  effects: [
    getBrowserStorageEffectForKey("fo3d-isGridInfinitelyLarge", {
      valueClass: "boolean",
    }),
  ],
});

export const gridSizeAtom = atom<number>({
  key: "fo3d-gridSize",
  default: 1000,
  effects: [getBrowserStorageEffectForKey("fo3d-gridSize")],
});

export const shouldGridFadeAtom = atom<boolean>({
  key: "fo3d-shouldGridFade",
  default: true,
  effects: [
    getBrowserStorageEffectForKey("fo3d-shouldGridFade", {
      valueClass: "boolean",
    }),
  ],
});

export const fo3dContainsBackground = atom<boolean>({
  key: "fo3d-containsBackground",
  default: false,
});

export const isFo3dBackgroundOnAtom = atom<boolean>({
  key: "fo3d-isBackgroundON",
  default: true,
  effects: [
    getBrowserStorageEffectForKey("fo3d-isBackgroundON", {
      valueClass: "boolean",
      prependDatasetNameInKey: true,
    }),
  ],
});

// LABEL RENDERING AND STYLING
export const shadeByAtom = atom<ShadeBy>({
  key: "fo3d-shadeBy",
  default: SHADE_BY_HEIGHT,
  effects: [
    getBrowserStorageEffectForKey("shadeBy", { prependDatasetNameInKey: true }),
  ],
});

export const customColorMapAtom = atom<{ [slice: string]: string } | null>({
  key: "fo3d-customColorMap",
  default: null,
  effects: [
    getBrowserStorageEffectForKey("customColorMap", {
      useJsonSerialization: true,
      prependDatasetNameInKey: true,
    }),
  ],
});

export const isColormapModalOpenAtom = atom<boolean>({
  key: "fo3d-isColormapModalOpen",
  default: false,
});

export const fo3dPcdDynamicAttributeColorMapOverridesAtom = atom<{
  [attribute: string]: ColorscaleInput;
}>({
  key: "fo3d-pcdDynamicAttributeColorMapOverrides",
  default: {},
  effects: [
    getBrowserStorageEffectForKey("fo3dPcdDynamicAttributeColorMapOverrides", {
      useJsonSerialization: true,
      prependDatasetNameInKey: true,
    }),
  ],
});

export const currentPointSizeAtom = atom<string>({
  key: "fo3d-pointSize",
  default: "2",
  effects: [
    getBrowserStorageEffectForKey("pointSize", {
      prependDatasetNameInKey: true,
    }),
  ],
});

export const isPointSizeAttenuatedAtom = atom<boolean>({
  key: "fo3d-isPointSizeAttenuated",
  default: false,
  effects: [
    getBrowserStorageEffectForKey("isPointSizeAttenuated", {
      valueClass: "boolean",
    }),
  ],
});

export const cuboidLabelLineWidthAtom = atom({
  key: "fo3d-cuboidLabelLineWidth",
  default: 3,
  effects: [
    getBrowserStorageEffectForKey("fo3d-cuboidLabelLineWidth", {
      valueClass: "number",
    }),
  ],
});

export const polylineLabelLineWidthAtom = atom({
  key: "fo3d-polylineLabelLineWidth",
  default: 3,
  effects: [
    getBrowserStorageEffectForKey("fo3d-polylineLabelLineWidth", {
      valueClass: "number",
    }),
  ],
});

export const avoidZFightingAtom = atom<boolean>({
  key: "fo3d-avoidZFighting",
  default: true,
  effects: [
    getBrowserStorageEffectForKey("fo3d-avoidZFighting", {
      valueClass: "boolean",
    }),
  ],
});

// SCENE AND NODES
export const activeNodeAtom = atom<FoSceneNode>({
  key: "fo3d-activeNode",
  default: null,
});

// CAMERA AND VIEWPOINT
export const cameraPositionAtom = atom<[number, number, number] | null>({
  key: "fo3d-cameraPosition",
  default: null,
});

export const cameraViewStatusAtom = atom<{
  viewName: string | null;
  timestamp: number | null;
}>({
  key: "fo3d-cameraViewStatus",
  default: {
    viewName: null,
    timestamp: null,
  },
});

export const currentHoveredPointAtom = atom<Vector3 | null>({
  key: "fo3d-currentHoveredPoint",
  default: null,
});

// Hover state for labels in annotate mode
export const hoveredLabelAtom = atom<OverlayLabel | null>({
  key: "fo3d-hoveredLabel",
  default: null,
});

// =============================================================================
// ANNOTATION RELATED
// =============================================================================

/**
 * Shared cursor position in 3D space for annotation interactions.
 * Used to track the current cursor position across different annotation panes.
 */
export const sharedCursorPositionAtom = atom<[number, number, number] | null>({
  key: "fo3d-sharedCursorPosition",
  default: null,
});

/**
 * The currently selected label for annotation operations.
 * Used to track which label is being actively edited or manipulated.
 */
export const selectedLabelForAnnotationAtom = atom<OverlayLabel | null>({
  key: "fo3d-selectedLabelForAnnotation",
  default: null,
});

/**
 * Active segmentation state for polyline annotation creation.
 * Manages the real-time state during interactive segmentation including:
 * - Whether segmentation is currently active
 * - Collection of vertices being drawn
 * - Current mouse position for preview
 * - Whether the polygon is closed
 *
 * IMPORTANT: This atom only holds the CURRENTLY actively drawn segment.
 * It should immediately reset to null state after drawing is finished.
 */
export const activeSegmentationStateAtom = atom<SegmentState>({
  key: "fo3d-segmentState",
  default: {
    isActive: false,
    vertices: [],
    currentMousePosition: null,
    isClosed: false,
  },
});

/**
 * Selector that returns whether the user is actively segmenting.
 * Derived from the segmentStateAtom's isActive property.
 */
export const isActivelySegmentingSelector = selector<boolean>({
  key: "fo3d-isActivelySegmentingSelector",
  get: ({ get }) => {
    return get(activeSegmentationStateAtom).isActive;
  },
});

/**
 * Tracks whether the pointer is currently down during segmentation.
 */
export const isSegmentingPointerDownAtom = atom<boolean>({
  key: "fo3d-isSegmentingPointerDownAtom",
  default: false,
});

/**
 * Whether to automatically snap and close polyline active segment.
 * When enabled, the active segment will automatically close when the user double clicks.
 */
export const snapCloseAutomaticallyAtom = atom<boolean>({
  key: "fo3d-snapCloseAutomatically",
  default: false,
});

/**
 * Whether the user is in edit segments mode.
 * When enabled, allows editing of existing segments in polylines.
 */
export const editSegmentsModeAtom = atom<boolean>({
  key: "fo3d-editSegmentsMode",
  default: false,
});

/**
 * Whether polyline annotation mode is currently active.
 * Persisted in session storage to maintain state across page reloads.
 */
export const isPolylineAnnotateActiveAtom = atom<boolean>({
  key: "fo3d-isPolylineAnnotateActive",
  default: false,
  effects: [
    getBrowserStorageEffectForKey("fo3d-isPolylineAnnotateActive", {
      valueClass: "boolean",
      sessionStorage: true,
      prependDatasetNameInKey: true,
    }),
  ],
});

/**
 * The currently active annotation field for 3D annotation.
 * Tracks which field is being annotated in the 3D viewer.
 */
export const currentActiveAnnotationField3dAtom = atom<string | null>({
  key: "fo3d-currentActiveAnnotationField3d",
  default: null,
  effects: [
    getBrowserStorageEffectForKey("fo3d-currentActiveAnnotationField3d", {
      prependDatasetNameInKey: true,
    }),
  ],
});

/**
 * The currently selected polyline vertex for editing.
 */
export const selectedPolylineVertexAtom = atom<SelectedPoint | null>({
  key: "fo3d-selectedPolylineVertexAtom",
  default: null,
});

/**
 * Transform data for temporary polyline segments.
 */
export const polylinePointTransformsAtom = atom<Record<
  string,
  PolylinePointTransformData
> | null>({
  key: "fo3d-polylinePointTransforms",
  default: {},
});

/**
 * The current transform mode (translate, rotate, scale).
 * Determines how objects are transformed when manipulated.
 */
export const transformModeAtom = atom<TransformMode>({
  key: "fo3d-transformMode",
  default: "translate",
});

/**
 * The current transform space (world, local).
 * Determines whether transformations are applied in world or local coordinates.
 */
export const transformSpaceAtom = atom<TransformSpace>({
  key: "fo3d-transformSpace",
  default: "world",
});

/**
 * The currently selected archetype for transformation.
 */
export const currentArchetypeSelectedForTransformAtom =
  atom<TransformArchetype | null>({
    key: "fo3d-currentArchetypeSelectedForTransformAtom",
    default: null,
  });

/**
 * Whether any entity is currently being actively transformed.
 * Used to track the overall transformation state across all objects.
 */
export const isCurrentlyTransformingAtom = atom<boolean>({
  key: "fo3d-isCurrentlyTransformingAtom",
  default: false,
});

/**
 * Temporary transform data for labels during manipulation.
 * Stores intermediate transform values before they are committed.
 * Keyed by label ID.
 */
export const tempLabelTransformsAtom = atomFamily<
  {
    position: [number, number, number];
    quaternion: [number, number, number, number];
  } | null,
  string
>({
  key: "fo3d-tempLabelTransforms",
  default: null,
});

/**
 * Temporary transform data for vertices during manipulation.
 * Stores intermediate transform values for polyline vertices before they are committed.
 * Keyed by vertex ID.
 */
export const tempVertexTransformsAtom = atomFamily<
  {
    position: [number, number, number];
    quaternion: [number, number, number, number];
  } | null,
  string
>({
  key: "fo3d-tempVertexTransforms",
  default: null,
});

/**
 * Internal implementation for the annotation plane state facade.
 */
const annotationPlaneAtomImpl = atomFamily<AnnotationPlaneState, string>({
  key: "fo3d-annotationPlane",
  default: {
    enabled: false,
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    showX: true,
    showY: true,
    showZ: true,
  },
  effects: (datasetName) => [
    getBrowserStorageEffectForKey(
      `fo3d-segmentationAnnotationPlane_${datasetName}`,
      {
        useJsonSerialization: true,
      }
    ),
  ],
});

// Public facade for annotation plane state, keyed by the current fos.datasetName

/**
 * State for the annotation plane used for 3D annotation.
 * Controls the position, orientation, and visibility of the annotation plane.
 * Persisted in session storage.
 */
export const annotationPlaneAtom = selector<AnnotationPlaneState>({
  key: "fo3d-annotationPlaneFacade",
  get: ({ get }) => {
    const name = get(fos.datasetName) ?? "__no_dataset__";
    return get(annotationPlaneAtomImpl(name));
  },
  set: ({ get, set, reset }, newValue) => {
    const name = get(fos.datasetName) ?? "__no_dataset__";
    if (newValue instanceof DefaultValue) {
      reset(annotationPlaneAtomImpl(name));
    } else {
      set(annotationPlaneAtomImpl(name), newValue as AnnotationPlaneState);
    }
  },
});

/**
 * Selector to clear all annotation-related state.
 * Resets all transform, segmentation, and cursor states to their defaults.
 */
export const clearTransformStateSelector = selector({
  key: "fo3d-clearTransformState",
  get: () => null,
  set: ({ set }) => {
    set(transformModeAtom, "translate");
    set(transformSpaceAtom, "world");
    set(selectedPolylineVertexAtom, null);
    set(currentArchetypeSelectedForTransformAtom, null);
    set(isCurrentlyTransformingAtom, false);
    // Note: We don't clear polylinePointTransforms here as it should persist
    set(activeSegmentationStateAtom, {
      isActive: false,
      vertices: [],
      currentMousePosition: null,
      isClosed: false,
    });
    set(sharedCursorPositionAtom, null);
    set(cameraViewStatusAtom, {
      viewName: null,
      timestamp: null,
    });
    set(editSegmentsModeAtom, false);
  },
});
