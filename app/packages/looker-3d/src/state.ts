import type { Range } from "@fiftyone/core/src/components/Common/RangeSlider";
import { ColorscaleInput } from "@fiftyone/looker/src/state";
import {
  getBrowserStorageEffectForKey,
  groupId,
  nullableModalSampleId,
} from "@fiftyone/state";
import { atom, atomFamily, selector } from "recoil";
import { Vector3, type Vector3Tuple } from "three";
import { SHADE_BY_HEIGHT } from "./constants";
import type { FoSceneNode } from "./hooks";
import type { Actions, AssetLoadingLog, ShadeBy } from "./types";

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
  effects: [getBrowserStorageEffectForKey("shadeBy")],
});

export const customColorMapAtom = atom<{ [slice: string]: string } | null>({
  key: "fo3d-customColorMap",
  default: null,
  effects: [
    getBrowserStorageEffectForKey("customColorMap", {
      useJsonSerialization: true,
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
  effects: [getBrowserStorageEffectForKey("pointSize")],
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
export const hoveredLabelAtom = atom<any | null>({
  key: "fo3d-hoveredLabel",
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

// Transform control state
export type TransformMode = "translate" | "rotate" | "scale";
export type TransformSpace = "world" | "local";

export const selectedLabelForAnnotationAtom = atom<any | null>({
  key: "fo3d-selectedLabelForAnnotation",
  default: null,
});

export const isInTransformModeAtom = atom<boolean>({
  key: "fo3d-isInTransformMode",
  default: false,
});

export const transformModeAtom = atom<TransformMode>({
  key: "fo3d-transformMode",
  default: "translate",
});

export const transformSpaceAtom = atom<TransformSpace>({
  key: "fo3d-transformSpace",
  default: "world",
});

export const isTransformingAtom = atom<boolean>({
  key: "fo3d-isTransforming",
  default: false,
});

// Transform data for HUD display
export interface TransformData {
  // Delta X
  dx?: number;
  // Delta Y
  dy?: number;
  // Delta Z
  dz?: number;
  // Absolute world position X
  x?: number;
  // Absolute world position Y
  y?: number;
  // Absolute world position Z
  z?: number;
  // Dimensions X
  dimensionX?: number;
  // Dimensions Y
  dimensionY?: number;
  // Dimensions ZÒ
  dimensionZ?: number;
  // Local rotation X (in degrees)
  rotationX?: number;
  // Local rotation Y (in degrees)
  rotationY?: number;
  // Local rotation Z (in degrees)
  rotationZ?: number;
}

export const transformDataAtom = atom<TransformData>({
  key: "fo3d-transformData",
  default: {},
});

// Transformed label data storage
export interface TransformedLabelData {
  worldPosition: [number, number, number];
  dimensions: [number, number, number];
  localRotation: [number, number, number];
  worldRotation: [number, number, number];
}

// todo: we sync this with backend
export const transformedLabelsAtom = atom<Record<string, TransformedLabelData>>(
  {
    key: "fo3d-transformedLabels",
    default: {},
  }
);

// Selector to clear all transform state
export const clearTransformStateSelector = selector({
  key: "fo3d-clearTransformState",
  get: () => null,
  set: ({ set }) => {
    set(selectedLabelForAnnotationAtom, null);
    set(isInTransformModeAtom, false);
    set(transformModeAtom, "translate");
    set(transformSpaceAtom, "world");
    set(isTransformingAtom, false);
    set(transformDataAtom, {});
    // Note: We don't clear transformedLabelsAtom here as it should persist
  },
});

// Polyline segment addition state
export interface NewPolylineSegment {
  vertices: Vector3Tuple[];
  isTemporary?: boolean; // For preview while placing
}

export interface PolylineSegmentEditState {
  segments: NewPolylineSegment[];
  activeVertexIndex?: number; // Index of vertex being transformed
}

// Map of label ID to new segments
export const polylineSegmentEditsAtom = atom<
  Record<string, PolylineSegmentEditState>
>({
  key: "fo3d-polylineSegmentEdits",
  default: {},
});

// Current mode for polyline editing
export type PolylineEditMode = "idle" | "adding" | "editing";

export const polylineEditModeAtom = atom<PolylineEditMode>({
  key: "fo3d-polylineEditMode",
  default: "idle",
});

// Label ID of the polyline currently being edited
export const activePolylineLabelAtom = atom<string | null>({
  key: "fo3d-activePolylineLabel",
  default: null,
});

// Temporary vertices being placed (before confirming the segment)
export const temporaryVerticesAtom = atom<Vector3Tuple[]>({
  key: "fo3d-temporaryVertices",
  default: [],
});

// Selected polyline point for transformation
export interface SelectedPolylinePoint {
  labelId: string;
  segmentIndex: number; // Index of the segment within the polyline
  pointIndex: number; // Index of the point within the segment (0 or 1)
  position: Vector3Tuple;
}

export const selectedPolylinePointAtom = atom<SelectedPolylinePoint | null>({
  key: "fo3d-selectedPolylinePoint",
  default: null,
});
