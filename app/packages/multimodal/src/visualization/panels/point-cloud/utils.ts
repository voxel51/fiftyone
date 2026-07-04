import * as THREE from "three";

import type {
  RgbaColor,
  SceneLinePrimitive,
  ScenePoint3D,
} from "../../../decoders";
import type {
  PanelNotice,
  SceneAnnotationPanelLayer,
  SceneAnnotationPrimitiveSummary,
} from "./types";

const DEFAULT_SCENE_CUBE_COLOR: RgbaColor = [0.1, 0.78, 0.95, 1];
export const EMPTY_NOTICES: readonly PanelNotice[] = [];

// Selected/echoed entities render white and brighter so they pop against
// the per-class colors without occluding the points inside them.
const SCENE_EMPHASIS_COLOR_HEX = 0xffffff;
const SCENE_EMPHASIS_OPACITY_BOOST = 0.3;

export function sceneMaterialProps(
  color: RgbaColor | null,
  maxOpacity: number,
  emphasized = false,
): {
  readonly color: number;
  readonly opacity: number;
  readonly transparent: boolean;
} {
  if (emphasized) {
    return {
      color: SCENE_EMPHASIS_COLOR_HEX,
      opacity: Math.min(1, maxOpacity + SCENE_EMPHASIS_OPACITY_BOOST),
      transparent: true,
    };
  }
  const [r, g, b, a] = color ?? DEFAULT_SCENE_CUBE_COLOR;

  return {
    color: new THREE.Color(clamp01(r), clamp01(g), clamp01(b)).getHex(),
    opacity: Math.max(0.2, Math.min(maxOpacity, clamp01(a))),
    transparent: true,
  };
}

export function primitivePointIndices(
  points: readonly ScenePoint3D[],
  indices: readonly number[],
) {
  const sourceIndices =
    indices.length > 0 ? indices : points.map((_, index) => index);

  return sourceIndices.filter(
    (index) => Number.isInteger(index) && index >= 0 && index < points.length,
  );
}

export function lineSegmentPairs(
  pointIndices: readonly number[],
  type: SceneLinePrimitive["type"],
) {
  const pairs: Array<readonly [number, number]> = [];

  if (type === "line-list") {
    for (let index = 0; index + 1 < pointIndices.length; index += 2) {
      pairs.push([pointIndices[index], pointIndices[index + 1]]);
    }
    return pairs;
  }

  for (let index = 0; index + 1 < pointIndices.length; index++) {
    pairs.push([pointIndices[index], pointIndices[index + 1]]);
  }
  if (type === "line-loop" && pointIndices.length > 2) {
    pairs.push([pointIndices[pointIndices.length - 1], pointIndices[0]]);
  }

  return pairs;
}

export function rgbComponents(color: RgbaColor | undefined) {
  const [r, g, b] = color ?? DEFAULT_SCENE_CUBE_COLOR;

  return [clamp01(r), clamp01(g), clamp01(b)] as const;
}

export function rgbaColorKey(color: RgbaColor) {
  return color.map((component) => clamp01(component).toFixed(4)).join(",");
}

export function rgbaCss(color: RgbaColor) {
  const [r, g, b, a] = color;
  return `rgba(${Math.round(clamp01(r) * 255)}, ${Math.round(
    clamp01(g) * 255,
  )}, ${Math.round(clamp01(b) * 255)}, ${clamp01(a)})`;
}

export function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

export function isFinitePositiveVector(
  value: readonly [number, number, number],
): boolean {
  return value.every(
    (component) => Number.isFinite(component) && component > 0,
  );
}

export function isFinitePositiveNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function isFinitePoint3(
  point: ScenePoint3D | undefined,
): point is ScenePoint3D {
  return !!point && point.every((component) => Number.isFinite(component));
}

export function annotationPrimitiveSummaryForLayers(
  layers: readonly SceneAnnotationPanelLayer[],
): SceneAnnotationPrimitiveSummary {
  const summary = {
    arrowCount: 0,
    cubeCount: 0,
    cylinderCount: 0,
    lineCount: 0,
    modelCount: 0,
    sphereCount: 0,
    textCount: 0,
    totalCount: 0,
    triangleCount: 0,
  };

  for (const layer of layers) {
    for (const entity of layer.frame.entities) {
      summary.arrowCount += entity.arrowCount;
      summary.cubeCount += entity.cubeCount;
      summary.cylinderCount += entity.cylinderCount;
      summary.lineCount += entity.lineCount;
      summary.modelCount += entity.modelCount;
      summary.sphereCount += entity.sphereCount;
      summary.textCount += entity.textCount;
      summary.triangleCount += entity.triangleCount;
    }
  }
  summary.totalCount =
    summary.arrowCount +
    summary.cubeCount +
    summary.cylinderCount +
    summary.lineCount +
    summary.modelCount +
    summary.sphereCount +
    summary.textCount +
    summary.triangleCount;

  return summary;
}
