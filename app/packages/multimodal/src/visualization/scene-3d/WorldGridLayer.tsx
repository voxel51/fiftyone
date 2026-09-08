/* eslint-disable react/no-unknown-property */
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import {
  abs,
  cameraPosition,
  clamp,
  float,
  floor,
  fract,
  fwidth,
  log2,
  max,
  mix,
  positionGeometry,
  positionWorld,
  pow,
  vec2,
  vec3,
  type Node,
} from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { useInvalidateOn } from "./use-invalidate-on";

/**
 * Infinite reference grid on the world ground plane (perpendicular to the
 * scene's up axis, through the origin).
 *
 * The line intensity is a pixel-space grid in the spirit of Ben Golus'
 * "The Best Darn Grid Shader (Yet)"
 * (https://bgolus.medium.com/the-best-darn-grid-shader-yet-727f9278b9d8):
 *
 * - The mesh is a unit quad re-positioned in the vertex stage into a huge
 *   camera-centered quad on the plane, so the grid never runs out and vertex
 *   precision scales with the camera's height above the plane.
 * - Line intensity is computed from screen-space derivatives, giving
 *   constant-width anti-aliased lines at any zoom.
 * - Spacing adapts by powers of ten with the camera distance: every tenth
 *   line is a "cardinal" line, and as the camera recedes the regular lines
 *   cross-fade into the cardinals of the next magnitude.
 * - Lines whose screen-space spacing gets too dense fade out instead of
 *   aliasing into noise near the horizon.
 */

/** World axis treated as "up"; the grid spans the two other axes. */
export type WorldGridUpAxis = "x" | "y" | "z";

/** Closest line spacing in scene units (meters). */
const DEFAULT_SPACING_M = 1;

/** Neutral gray keeps the lines legible on the dark panel background. */
const GRID_COLOR = "#808080";

/** Peak line opacity — a subtle reference, not a feature. */
const DEFAULT_OPACITY = 0.05;

/** Line thickness in device pixels. */
const LINE_THICKNESS_PX = 1;

/**
 * The quad spans this multiple of the camera's height above the plane in
 * every direction — effectively infinite, while keeping relative vertex
 * precision constant.
 */
const PLANE_EXTENT_FACTOR = 1000;

/**
 * Below this screen-space line spacing (in multiples of the line width)
 * lines are fully faded out; above `FULLY_VISIBLE_SPACING` they are fully
 * opaque.
 */
const FULLY_INVISIBLE_SPACING = 2;
const FULLY_VISIBLE_SPACING = 10;

/**
 * Drawn first among transparent objects: the grid is everywhere, so
 * distance sorting against other transparents is meaningless and
 * flicker-prone. Map/occupancy layers use small negative render orders,
 * so go well below those.
 */
const WORLD_GRID_RENDER_ORDER = -1000;

/** The grid never participates in measurement or scene picking. */
const NOOP_RAYCAST = () => undefined;

/** The two world axes spanning the grid plane for each up axis. */
const PLANE_AXES: Record<
  WorldGridUpAxis,
  readonly [WorldGridUpAxis, WorldGridUpAxis]
> = {
  x: ["y", "z"],
  y: ["x", "z"],
  z: ["x", "y"],
};

/** World position from two in-plane coordinates (zero along `up`). */
function composePlanePosition(up: WorldGridUpAxis, a: Node, b: Node): Node {
  switch (up) {
    case "x":
      return vec3(0, a, b);
    case "y":
      return vec3(a, 0, b);
    case "z":
      return vec3(a, b, 0);
  }
}

/**
 * `clamp((x - edge0) / (edge1 - edge0), 0, 1)` — linear ramp between the
 * edges. Called with `edge0 > edge1` to get a descending ramp (inside the
 * line → 1, outside → 0) with anti-aliasing width `edge0 - edge1`.
 */
function linearstep(edge0: Node, edge1: Node, x: Node) {
  return clamp(x.sub(edge0).div(edge1.sub(edge0)), 0, 1);
}

/** Distance to the nearest integer grid line in x and y, in [0, 1]. */
function distanceToGridLine(scaledPlanePosition: Node) {
  return float(1).sub(abs(fract(scaledPlanePosition).mul(2).sub(1)));
}

/** Exported for tests. */
export function createWorldGridMaterial({
  opacity,
  spacing,
  thicknessPx,
  up,
}: {
  readonly opacity: number;
  readonly spacing: number;
  readonly thicknessPx: number;
  readonly up: WorldGridUpAxis;
}) {
  const material = new MeshBasicNodeMaterial();
  material.transparent = true;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  material.color.set(GRID_COLOR);

  const [planeAxisA, planeAxisB] = PLANE_AXES[up];

  // Vertex stage: blow the unit quad up into a camera-centered quad on the
  // ground plane. The extent floor keeps the quad non-degenerate when the
  // camera sits on the plane (edge-on, the grid is invisible anyway).
  const cameraPlaneDistance = abs(cameraPosition[up]);
  const planeExtent = max(cameraPlaneDistance, 1).mul(PLANE_EXTENT_FACTOR);
  material.positionNode = composePlanePosition(
    up,
    positionGeometry.x.mul(planeExtent).add(cameraPosition[planeAxisA]),
    positionGeometry.y.mul(planeExtent).add(cameraPosition[planeAxisB]),
  );

  // Which powers of ten to show: fully at `floor(cardinality)`, cross-fading
  // into the next at `fract(cardinality)`. The -0.9 (instead of -1) keeps a
  // hint of the next level visible even very close to the plane.
  const cameraDistanceGridUnits = cameraPlaneDistance.div(spacing);
  const cardinality = max(
    log2(cameraDistanceGridUnits).div(Math.log2(10)).sub(0.9),
    0,
  );
  const baseCardinality = floor(cardinality);
  const lineSpacingFactor = pow(10, baseCardinality).mul(spacing);
  const nextCardinalityInterpolation = cardinality.sub(baseCardinality);

  const planePosition = vec2(
    positionWorld[planeAxisA],
    positionWorld[planeAxisB],
  ).div(lineSpacingFactor);

  // Pixel-space line intensity: how many grid units one pixel covers
  // (fwidth) converts the pixel thickness into grid units, and the same
  // derivative doubles as the anti-aliasing ramp width. The epsilon guards
  // the degenerate zero-derivative case (edge-on views).
  const derivative = fwidth(planePosition).max(1e-8);
  const widthInGridUnits = derivative.mul(thicknessPx);
  const outerEdge = widthInGridUnits.add(derivative);
  const innerEdge = widthInGridUnits.sub(derivative);

  // Fade lines out as they crowd together on screen; the cardinal set is
  // ten times sparser, so it fades ten times later.
  const screenSpaceLineSpacing = float(1).div(
    max(widthInGridUnits.x, widthInGridUnits.y),
  );
  const baseFade = linearstep(
    float(FULLY_INVISIBLE_SPACING),
    float(FULLY_VISIBLE_SPACING),
    screenSpaceLineSpacing,
  );
  const cardinalFade = linearstep(
    float(FULLY_INVISIBLE_SPACING),
    float(FULLY_VISIBLE_SPACING),
    screenSpaceLineSpacing.mul(10),
  );

  const baseIntensity = linearstep(
    outerEdge,
    innerEdge,
    distanceToGridLine(planePosition),
  ).mul(baseFade);
  const cardinalIntensity = linearstep(
    outerEdge,
    innerEdge,
    distanceToGridLine(planePosition.mul(0.1)).mul(10),
  ).mul(cardinalFade);

  // Lerp (not add) regular into cardinal so anti-aliasing survives and
  // cardinals weaken when no regular lines support them.
  const combined = mix(
    baseIntensity,
    cardinalIntensity,
    nextCardinalityInterpolation,
  );
  material.opacityNode = max(combined.x, combined.y).mul(opacity);

  return material;
}

/**
 * Adaptive reference grid on the world ground plane. Purely a visual
 * reference: it never occludes scene content (no depth writes), never
 * intercepts picking, and contributes nothing to layer bounds.
 */
export function WorldGridLayer({
  opacity = DEFAULT_OPACITY,
  spacing = DEFAULT_SPACING_M,
  up = "z",
}: {
  /** Peak line opacity in [0, 1]. */
  readonly opacity?: number;
  /** Closest line spacing in scene units; lines adapt by powers of ten. */
  readonly spacing?: number;
  /** World up axis; the grid plane is perpendicular to it. */
  readonly up?: WorldGridUpAxis;
}) {
  // fwidth works in device pixels; scale the target thickness by the
  // canvas' pixel ratio so lines keep their CSS-pixel width at any DPR.
  const dpr = useThree((state) => state.viewport.dpr);
  const material = useMemo(
    () =>
      createWorldGridMaterial({
        opacity,
        spacing,
        thicknessPx: LINE_THICKNESS_PX * dpr,
        up,
      }),
    [dpr, opacity, spacing, up],
  );

  useEffect(() => () => material.dispose(), [material]);
  useInvalidateOn([material]);

  // Cast, not a type: @react-three/fiber's bundled three types disagree
  // with the app's pinned three version, so the node material fails the
  // mesh material prop check. Same workaround as GridSceneLayer's texture.
  const meshMaterial = material as never;

  return (
    <mesh
      frustumCulled={false}
      material={meshMaterial}
      name="world-grid"
      raycast={NOOP_RAYCAST}
      renderOrder={WORLD_GRID_RENDER_ORDER}
    >
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
