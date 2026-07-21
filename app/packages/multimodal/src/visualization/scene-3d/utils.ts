import * as THREE from "three";

import type {
  RgbaColor,
  SceneLinePrimitive,
  ScenePoint3D,
} from "../../decoders";
import type {
  PanelNotice,
  SceneAnnotationPanelLayer,
  SceneAnnotationPrimitiveSummary,
} from "./types";

const DEFAULT_SCENE_CUBE_COLOR: RgbaColor = [0.1, 0.78, 0.95, 1];
export const EMPTY_NOTICES: readonly PanelNotice[] = [];
const HEX_COLOR_PATTERN = /^#?([0-9a-f]{6})$/i;
const RGB_MAX = 255;

// Selected/echoed entities render white and brighter so they pop against
// the per-class colors without occluding the points inside them.
const SCENE_EMPHASIS_COLOR_HEX = 0xffffff;
const SCENE_EMPHASIS_OPACITY_BOOST = 0.3;

// Dash pattern (scene units, i.e. meters) for line work on SELECTED
// entities — hover keeps solid strokes, matching the 2D overlay
// convention where only selection dashes.
export const SCENE_SELECTED_DASH_SIZE = 0.2;
export const SCENE_SELECTED_GAP_SIZE = 0.12;

/**
 * Populates the `lineDistance` attribute `LineDashedMaterial` requires.
 * Returns the same geometry for chaining.
 */
export function withLineDistances(
  geometry: THREE.BufferGeometry,
): THREE.BufferGeometry {
  const probe = new THREE.LineSegments(geometry);
  probe.computeLineDistances();
  (probe.material as THREE.Material).dispose();
  return geometry;
}

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

/** Normalize display identifiers for loose matching across field and colormap names. */
export function normalizeIdentifierName(value: unknown): string {
  return typeof value === "string"
    ? value.toLowerCase().replace(/[^a-z0-9]/g, "")
    : "";
}

/** Normalize a six-digit hex color to lowercase `#rrggbb`, or `null` if invalid. */
export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = value.trim().match(HEX_COLOR_PATTERN);
  return match ? `#${match[1].toLowerCase()}` : null;
}

/** Convert a hex color string to normalized RGB channels in `[0, 1]`. */
export function hexToRgbUnit(value: string): readonly [number, number, number] {
  const normalized = normalizeHexColor(value) ?? "#000000";
  return [
    parseInt(normalized.slice(1, 3), 16) / RGB_MAX,
    parseInt(normalized.slice(3, 5), 16) / RGB_MAX,
    parseInt(normalized.slice(5, 7), 16) / RGB_MAX,
  ];
}

/** Convert a hex color string to integer RGB channels in `[0, 255]`. */
export function hexToRgb255(value: string): readonly [number, number, number] {
  const normalized = normalizeHexColor(value) ?? "#000000";
  return [
    parseInt(normalized.slice(1, 3), 16),
    parseInt(normalized.slice(3, 5), 16),
    parseInt(normalized.slice(5, 7), 16),
  ];
}

/** Convert integer RGB channels to a clamped lowercase `#rrggbb` color. */
export function rgbToHex(color: readonly [number, number, number]): string {
  return `#${color
    .map((component) =>
      Math.max(0, Math.min(RGB_MAX, component)).toString(16).padStart(2, "0"),
    )
    .join("")}`;
}

/** Interpolate between two hex colors and return the blended `#rrggbb` color. */
export function interpolateHexColors(
  low: string,
  high: string,
  factor: number,
): string {
  const lowRgb = hexToRgb255(low);
  const highRgb = hexToRgb255(high);
  return rgbToHex(
    lowRgb.map((component, index) =>
      Math.round(component + (highRgb[index] - component) * factor),
    ) as [number, number, number],
  );
}

/**
 * Complementary color (hue rotated 180°, saturation/lightness preserved)
 * of normalized RGB channels. Achromatic inputs invert lightness instead,
 * so gray points still flip visibly under hover emphasis.
 */
export function complementaryRgbUnit(
  color: readonly [number, number, number],
): readonly [number, number, number] {
  const r = clamp01(color[0]);
  const g = clamp01(color[1]);
  const b = clamp01(color[2]);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const chroma = max - min;
  if (chroma < 1e-6) {
    const inverted = clamp01(1 - lightness);
    return [inverted, inverted, inverted];
  }

  let hue: number;
  if (max === r) {
    hue = ((g - b) / chroma + 6) % 6;
  } else if (max === g) {
    hue = (b - r) / chroma + 2;
  } else {
    hue = (r - g) / chroma + 4;
  }
  hue = (hue + 3) % 6;

  const x = chroma * (1 - Math.abs((hue % 2) - 1));
  const sector = Math.floor(hue);
  const [r1, g1, b1] =
    sector === 0
      ? [chroma, x, 0]
      : sector === 1
        ? [x, chroma, 0]
        : sector === 2
          ? [0, chroma, x]
          : sector === 3
            ? [0, x, chroma]
            : sector === 4
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const m = lightness - chroma / 2;
  return [clamp01(r1 + m), clamp01(g1 + m), clamp01(b1 + m)];
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
