import type { Range } from "@fiftyone/core/src/components/Common/RangeSlider";
import { ColorscaleInput } from "@fiftyone/looker/src/state";
import {
  getBrowserStorageEffectForKey,
  groupId,
  nullableModalSampleId,
} from "@fiftyone/state";
import { atom, atomFamily, selector } from "recoil";
import { Vector3, Vector3Tuple } from "three";
import type {
  AnnotationPlaneState,
  HoveredPolylineInfo,
  PolylinePointTransformData,
  SegmentPolylineState,
  SelectedPoint,
  TempPolyline,
  TransformedLabelData,
  TransformMode,
  TransformSpace,
} from "./annotation/types";
import { SHADE_BY_HEIGHT } from "./constants";
import type { FoSceneNode } from "./hooks";
import { OverlayLabel } from "./labels/loader";
import type { Actions, AssetLoadingLog, ShadeBy } from "./types";
import { TransformArchetype } from "./types";

const fo3dAssetsParseStatusLog = atomFamily<AssetLoadingLog[], string>({
  key: "fo3d-assetsParseStatusLogs",
  default: [],
});

export const fo3dAssetsParseStatusThisSample = selector<AssetLoadingLog[]>({
  key: "fo3d-assetsParseStatusLogs",
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

export const cameraPositionAtom = atom<[number, number, number] | null>({
  key: "fo3d-cameraPosition",
  default: null,
});

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

export const currentActionAtom = atom<Actions>({
  key: "fo3d-openAction",
  default: null,
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

export const pointSizeRangeAtom = atom<Range>({
  key: "fo3d-pointSizeRange",
  default: [0.1, 2],
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

export const isGridOnAtom = atom<boolean>({
  key: "fo3d-isGridOn",
  default: true,
  effects: [
    getBrowserStorageEffectForKey("fo3d-isGridOn", {
      valueClass: "boolean",
    }),
  ],
});

export const isLevaConfigPanelOnAtom = atom<boolean>({
  key: "fo3d-isLevaConfigPanelOn",
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

export const isStatusBarOnAtom = atom<boolean>({
  key: "fo3d-isStatusBarOn",
  default: false,
});

export const activeNodeAtom = atom<FoSceneNode>({
  key: "fo3d-activeNode",
  default: null,
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

export const hoveredPolylineInfoAtom = atom<HoveredPolylineInfo | null>({
  key: "fo3d-hoveredPolylineInfo",
  default: null,
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

export const selectedLabelForAnnotationAtom = atom<OverlayLabel | null>({
  key: "fo3d-selectedLabelForAnnotation",
  default: null,
});

export const transformModeAtom = atom<TransformMode>({
  key: "fo3d-transformMode",
  default: "translate",
});

export const transformSpaceAtom = atom<TransformSpace>({
  key: "fo3d-transformSpace",
  default: "world",
});

export const currentArchetypeSelectedForTransformAtom =
  atom<TransformArchetype | null>({
    key: "fo3d-currentArchetypeSelectedForTransformAtom",
    default: null,
  });

// True if ANY entity is being actively transformed
export const isCurrentlyTransformingAtom = atom<boolean>({
  key: "fo3d-isCurrentlyTransformingAtom",
  default: false,
});

// todo: we sync this with backend
export const transformedLabelsAtom = atom<Record<string, TransformedLabelData>>(
  {
    key: "fo3d-transformedLabels",
    default: {},
  }
);

export const selectedPolylineVertexAtom = atom<SelectedPoint | null>({
  key: "fo3d-selectedPolylineVertexAtom",
  default: null,
});

export const polylinePointTransformsAtom = atom<
  Record<string, PolylinePointTransformData>
>({
  key: "fo3d-polylinePointTransforms",
  default: {},
});

export const polylineEffectivePointsAtom = atomFamily<Vector3Tuple[][], string>(
  {
    key: "fo3d-polylineEffectivePoints",
    default: [],
  }
);

export const segmentPolylineStateAtom = atom<SegmentPolylineState>({
  key: "fo3d-segmentPolylineState",
  default: {
    isActive: false,
    vertices: [],
    currentMousePosition: null,
    isClosed: false,
  },
});

export const isActivelySegmentingSelector = selector<boolean>({
  key: "fo3d-isActivelySegmentingSelector",
  get: ({ get }) => {
    return get(segmentPolylineStateAtom).isActive;
  },
});

export const isSegmentingPointerDownAtom = atom<boolean>({
  key: "fo3d-isSegmentingPointerDownAtom",
  default: false,
});

export const tempPolylinesAtom = atom<TempPolyline[]>({
  key: "fo3d-tempPolylines",
  default: [],
});

export const snapCloseAutomaticallyAtom = atom<boolean>({
  key: "fo3d-snapCloseAutomatically",
  default: false,
});

export const editSegmentsModeAtom = atom<boolean>({
  key: "fo3d-editSegmentsMode",
  default: false,
});

export const sharedCursorPositionAtom = atom<[number, number, number] | null>({
  key: "fo3d-sharedCursorPosition",
  default: null,
});

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

export const annotationPlaneAtom = atom<AnnotationPlaneState>({
  key: "fo3d-annotationPlane",
  default: {
    enabled: false,
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    showX: true,
    showY: true,
    showZ: true,
  },
  effects: [
    getBrowserStorageEffectForKey("fo3d-annotationPlane", {
      useJsonSerialization: true,
      sessionStorage: true,
      prependDatasetNameInKey: true,
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

export const currentActiveAnnotationField3dAtom = atom<string | null>({
  key: "fo3d-currentActiveAnnotationField3d",
  default: null,
  effects: [
    getBrowserStorageEffectForKey("fo3d-currentActiveAnnotationField3d", {
      prependDatasetNameInKey: true,
    }),
  ],
});

// Selector to clear all annotation relates state
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
    set(segmentPolylineStateAtom, {
      isActive: false,
      vertices: [],
      currentMousePosition: null,
      isClosed: false,
    });
    set(sharedCursorPositionAtom, null);
    set(tempPolylinesAtom, []);
    set(cameraViewStatusAtom, {
      viewName: null,
      timestamp: null,
    });
  },
});
