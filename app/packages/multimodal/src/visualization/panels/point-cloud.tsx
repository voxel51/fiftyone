/* eslint-disable react/no-unknown-property */
import { useThree } from "@react-three/fiber";
import { Icon, IconName, Size } from "@voxel51/voodo";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as THREE from "three";

import type {
  PointCloudScalarField,
  PointCloudVisualization,
} from "../../decoders";
import {
  Base3DScene,
  type ThreeCameraPose,
  type ThreeCameraPoseChangeSource,
} from "./base-3d-scene";
import {
  VISUALIZATION_HUD_BACKGROUND_COLOR,
  VISUALIZATION_HUD_BORDER_COLOR,
  VISUALIZATION_HUD_TEXT_COLOR,
  VISUALIZATION_PANEL_BACKGROUND_COLOR,
  VISUALIZATION_STATUS_TEXT_COLOR,
} from "./style-tokens";
import { WebGpuCanvas } from "./webgpu-canvas";

// Initial camera pose: elevated and offset so the full scene is in view.
const PERSPECTIVE_POINT_CAMERA = {
  far: 10000,
  fov: 50,
  near: 0.01,
  position: [8, 5, 8] as [number, number, number],
};
// Render budget: beyond ~120k points the GPU cost outweighs the visual gain
// for typical LiDAR frames. Points are uniformly sampled down to this limit.
const DEFAULT_MAX_RENDERED_POINTS = 120_000;
// Default WebGL point sprite size in pixels.
const DEFAULT_POINT_SIZE = 2;
const CAMERA_FIT_PADDING = 1.35;
// Side length of the synthetic unit cube used when a cloud has no spread
// (e.g. a single point), so the camera has a non-zero target to frame.
const EMPTY_POINT_CLOUD_BOUNDS_SIZE = 1;
const MIN_POINT_SAMPLE_COUNT = 1;
const NORMALIZED_HEIGHT_MIN = 0;
const NORMALIZED_HEIGHT_MAX = 1;
const POINT_COMPONENT_COUNT = 3;
const COLOR_COMPONENT_COUNT = 3;
const X_COMPONENT_INDEX = 0;
const Y_COMPONENT_INDEX = 1;
const Z_COMPONENT_INDEX = 2;
// Height-to-colour mapping: points at the midpoint of the normalised height
// range blend between the cool (blue) and warm (red/green) colour anchors.
const HEIGHT_COLOR_MIDPOINT = 0.5;
// Scale factor applied to the normalised height before the colour ramp lookup.
const HEIGHT_COLOR_SCALE = 2;
const HEIGHT_COLOR_RED_BASE = 0.25;
const HEIGHT_COLOR_RED_RANGE = 0.75;
const HEIGHT_COLOR_GREEN_BASE = 0.55;
const HEIGHT_COLOR_GREEN_RANGE = 0.35;
const HEIGHT_COLOR_BLUE_BASE = NORMALIZED_HEIGHT_MAX;
const HEIGHT_COLOR_BLUE_WARM_RANGE = 0.48;
const HEIGHT_NORMALIZATION_EPSILON = 0.000001;
const HUD_BORDER_RADIUS_PX = 4;
const HUD_FONT_SIZE_PX = 11;
const HUD_LINE_HEIGHT = 1;
const HUD_OFFSET_PX = 8;
const STATUS_FONT_SIZE_PX = 13;
const STATUS_PADDING_PX = 16;
const CANONICAL_SCALAR_COLOR_FIELDS = [
  "intensity",
  "reflectivity",
  "reflectance",
  "rcs",
] as const;
const NEUTRAL_POINT_COLOR = [0.72, 0.76, 0.82] as const;

/**
 * Supported point-cloud colouring modes.
 */
export type PointCloudColorBy =
  | "auto"
  | "height"
  | "intensity"
  | "rcs"
  | "reflectance"
  | "reflectivity"
  | "rgb"
  | "uniform";

interface PointCloudRenderData {
  readonly bounds: THREE.Box3;
  readonly colors: Float32Array;
  readonly finitePointCount: number;
  readonly positions: Float32Array;
  readonly renderedPointCount: number;
}

interface PointCloudRenderLayer {
  readonly data: PointCloudRenderData;
  readonly layer: PointCloudPanelLayer;
}

interface PointCloudObjectTransform {
  readonly position: [number, number, number];
  readonly quaternion: [number, number, number, number];
}

/**
 * Transform from a point-cloud frame into the panel's fixed frame.
 */
export interface PointCloudFrameTransform {
  readonly resolutionKind?: string;
  readonly rotation: THREE.Quaternion;
  readonly sourceFrameId: string;
  readonly targetFrameId: string;
  readonly translation: THREE.Vector3;
}

/**
 * Camera pose shared by controlled point-cloud panels.
 */
export type PointCloudCameraPose = ThreeCameraPose;

/**
 * One point cloud rendered into the shared panel scene. `id` is the
 * stable identity used for React reconciliation and per-layer point
 * counting — use the source's topic/stream id.
 */
export interface PointCloudPanelLayer {
  readonly frame: PointCloudVisualization;
  readonly frameTransform?: PointCloudFrameTransform;
  readonly id: string;
}

export interface PointCloudPanelRenderStats {
  readonly cameraPose?: PointCloudCameraPose;
  readonly cameraPoseSource: "controlled" | "fitted" | "none";
  readonly declaredPointCount: number;
  readonly finitePointCount: number;
  readonly layerCount: number;
  readonly renderedPointCount: number;
}

/**
 * Props for rendering decoded point-cloud visualization frames. A panel
 * renders one shared 3D scene; each layer contributes one cloud to it.
 */
export interface PointCloudPanelProps {
  readonly cameraPose?: PointCloudCameraPose | null;
  readonly className?: string;
  readonly colorBy?: PointCloudColorBy;
  readonly fit?: "initial" | "frame" | "never";
  readonly layers: readonly PointCloudPanelLayer[];
  readonly maxRenderedPoints?: number;
  readonly onCameraPoseChange?: (
    pose: PointCloudCameraPose,
    source: ThreeCameraPoseChangeSource,
  ) => void;
  readonly onRenderStats?: (stats: PointCloudPanelRenderStats) => void;
  readonly pointSize?: number;
  readonly showGizmo?: boolean;
  readonly showHud?: boolean;
  readonly style?: CSSProperties;
  readonly warning?: string | null;
}

/**
 * Production point-cloud visualization panel backed by a stable Three.js
 * canvas. All layers share one scene and one camera, so multiple sensor
 * streams compose into a single fused view.
 */
export function PointCloudPanel({
  cameraPose,
  className,
  colorBy,
  fit = "initial",
  layers,
  maxRenderedPoints = DEFAULT_MAX_RENDERED_POINTS,
  onCameraPoseChange,
  onRenderStats,
  pointSize = DEFAULT_POINT_SIZE,
  showGizmo = true,
  showHud = true,
  style,
  warning = null,
}: PointCloudPanelProps) {
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const [focusSceneRequestKey, setFocusSceneRequestKey] = useState(0);
  const renderLayers = useMemo(
    () =>
      layers.map((layer) => ({
        data: buildPointCloudRenderData(
          layer.frame.positions,
          maxRenderedPoints,
          {
            colorBy,
            colors: layer.frame.colors,
            scalarFields: layer.frame.scalarFields,
          },
        ),
        layer,
      })),
    [colorBy, layers, maxRenderedPoints],
  );

  const frameFitPose = useMemo(
    () => cameraPoseForBounds(sceneBoundsForLayers(renderLayers)),
    [renderLayers],
  );
  const [initialFitPose, setInitialFitPose] =
    useState<PointCloudCameraPose | null>(null);

  // This effect captures the first fitted camera pose for initial-fit mode and
  // clears it when the panel switches to another fit policy.
  useEffect(() => {
    if (fit !== "initial") {
      if (initialFitPose) setInitialFitPose(null);
      return;
    }
    if (!initialFitPose && frameFitPose) {
      setInitialFitPose(frameFitPose);
    }
  }, [fit, frameFitPose, initialFitPose]);

  const fittedCameraPose =
    fit === "never"
      ? null
      : fit === "frame"
        ? frameFitPose
        : (initialFitPose ?? frameFitPose);
  const effectiveCameraPose = cameraPose ?? fittedCameraPose;
  const cameraPoseSource = cameraPose
    ? "controlled"
    : fittedCameraPose
      ? "fitted"
      : "none";

  const finitePointCount = renderLayers.reduce(
    (sum, layer) => sum + layer.data.finitePointCount,
    0,
  );
  const declaredPointCount = layers.reduce(
    (sum, layer) => sum + layer.frame.pointCount,
    0,
  );
  const hasPointCloudLayers = layers.length > 0;
  const requestFocusScene = useCallback(() => {
    setFocusSceneRequestKey((current) => current + 1);
  }, []);
  useEffect(() => {
    if (!onRenderStats || !hasPointCloudLayers) return;

    const frame = requestAnimationFrame(() => {
      onRenderStats({
        ...(effectiveCameraPose ? { cameraPose: effectiveCameraPose } : {}),
        cameraPoseSource,
        declaredPointCount,
        finitePointCount,
        layerCount: layers.length,
        renderedPointCount: renderLayers.reduce(
          (sum, layer) => sum + layer.data.renderedPointCount,
          0,
        ),
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [
    declaredPointCount,
    effectiveCameraPose,
    finitePointCount,
    cameraPoseSource,
    hasPointCloudLayers,
    layers.length,
    onRenderStats,
    renderLayers,
  ]);

  return (
    <div className={className} style={{ ...styles.panel, ...style }}>
      <WebGpuCanvas
        camera={PERSPECTIVE_POINT_CAMERA}
        onError={setCanvasError}
        role="img"
        style={styles.canvas}
      >
        <Base3DScene
          cameraPose={effectiveCameraPose}
          focusSceneRequestKey={focusSceneRequestKey || undefined}
          onCameraPoseChange={onCameraPoseChange}
          showGizmo={showGizmo}
        >
          {renderLayers.map(({ data, layer }) => (
            <PointCloudSceneLayer
              key={layer.id}
              data={data}
              layer={layer}
              pointSize={pointSize}
            />
          ))}
        </Base3DScene>
      </WebGpuCanvas>

      {canvasError ? (
        <div style={styles.status}>{canvasError}</div>
      ) : hasPointCloudLayers && finitePointCount === 0 ? (
        <div style={styles.status}>No finite points</div>
      ) : null}
      {!canvasError ? (
        <div style={styles.focusControls}>
          <button
            aria-label="Focus camera on visible 3D data"
            onClick={requestFocusScene}
            style={styles.focusButton}
            title="Focus camera on visible 3D data"
            type="button"
          >
            <Icon
              name={IconName.Move}
              size={Size.Xs}
              style={styles.focusButtonIcon}
            />
          </button>
        </div>
      ) : null}
      {!canvasError && showHud && hasPointCloudLayers ? (
        <div style={styles.hud}>
          {pointCountLabel(finitePointCount, declaredPointCount)}
        </div>
      ) : null}
      {warning ? <div style={styles.warning}>{warning}</div> : null}
    </div>
  );
}

function PointCloudSceneLayer({
  data,
  layer,
  pointSize,
}: {
  readonly data: PointCloudRenderData;
  readonly layer: PointCloudPanelLayer;
  readonly pointSize: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const { frameTransform } = layer;
  const objectTransform = useMemo(
    () => pointCloudObjectTransform(frameTransform),
    [frameTransform],
  );

  // This effect requests a frameloop-on-demand repaint when the layer's
  // placement changes.
  useEffect(() => {
    invalidate();
  }, [invalidate, objectTransform]);

  return (
    <group
      position={objectTransform.position}
      quaternion={objectTransform.quaternion}
    >
      <PointCloudPoints data={data} pointSize={pointSize} />
    </group>
  );
}

function PointCloudPoints({
  data,
  pointSize,
}: {
  readonly data: PointCloudRenderData;
  readonly pointSize: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const geometry = useMemo(() => createPointCloudGeometry(data), [data]);

  // This effect requests a repaint when point geometry changes and disposes the
  // old GPU geometry on cleanup.
  useEffect(() => {
    invalidate();
    return () => geometry.dispose();
  }, [geometry, invalidate]);

  return (
    <points frustumCulled={false}>
      <primitive attach="geometry" object={geometry} />
      <pointsMaterial size={pointSize} sizeAttenuation={false} vertexColors />
    </points>
  );
}

function createPointCloudGeometry(data: PointCloudRenderData) {
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(
    data.positions,
    POINT_COMPONENT_COUNT,
  );
  const colorAttribute = new THREE.BufferAttribute(
    data.colors,
    POINT_COMPONENT_COUNT,
  );
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  colorAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("color", colorAttribute);
  geometry.setDrawRange(0, data.renderedPointCount);
  geometry.boundingBox = data.bounds.clone();
  geometry.boundingSphere = data.bounds.getBoundingSphere(new THREE.Sphere());

  return geometry;
}

function buildPointCloudRenderData(
  sourcePositions: Float32Array,
  maxRenderedPoints: number,
  colorOptions: {
    readonly colorBy?: PointCloudColorBy;
    readonly colors?: Float32Array;
    readonly scalarFields?: readonly PointCloudScalarField[];
  },
): PointCloudRenderData {
  const sourcePointCount = Math.floor(
    sourcePositions.length / POINT_COMPONENT_COUNT,
  );
  const sampleEvery = Math.max(
    MIN_POINT_SAMPLE_COUNT,
    Math.ceil(
      sourcePointCount / Math.max(MIN_POINT_SAMPLE_COUNT, maxRenderedPoints),
    ),
  );
  const maxSampleCount = Math.max(
    MIN_POINT_SAMPLE_COUNT,
    Math.ceil(sourcePointCount / sampleEvery),
  );
  const positions = new Float32Array(maxSampleCount * POINT_COMPONENT_COUNT);
  const colors = new Float32Array(maxSampleCount * COLOR_COMPONENT_COUNT);
  const heightBounds = computeSourceHeightBounds(sourcePositions);
  const colorSource = resolvePointCloudColorSource({
    ...colorOptions,
    heightBounds,
    sourcePointCount,
    sourcePositions,
  });
  const bounds = new THREE.Box3();
  // Bounds are updated per rendered point; reuse one vector to avoid a large
  // allocation burst on dense point clouds.
  const tmpVec = new THREE.Vector3();
  let renderedPointCount = 0;

  bounds.makeEmpty();

  for (
    let sourcePointIndex = 0;
    sourcePointIndex < sourcePointCount;
    sourcePointIndex += sampleEvery
  ) {
    const sourceOffset = sourcePointIndex * POINT_COMPONENT_COUNT;
    const x = sourcePositions[sourceOffset];
    const y = sourcePositions[sourceOffset + Y_COMPONENT_INDEX];
    const z = sourcePositions[sourceOffset + Z_COMPONENT_INDEX];

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      continue;
    }

    const targetOffset = renderedPointCount * POINT_COMPONENT_COUNT;
    positions[targetOffset + X_COMPONENT_INDEX] = x;
    positions[targetOffset + Y_COMPONENT_INDEX] = y;
    positions[targetOffset + Z_COMPONENT_INDEX] = z;
    writePointColor(colors, targetOffset, colorSource, sourcePointIndex, z);
    tmpVec.set(
      positions[targetOffset + X_COMPONENT_INDEX],
      positions[targetOffset + Y_COMPONENT_INDEX],
      positions[targetOffset + Z_COMPONENT_INDEX],
    );
    bounds.expandByPoint(tmpVec);
    renderedPointCount++;
  }

  // Sampling can miss all finite source points, so the drawn count is the
  // authoritative signal for whether Three.js needs fallback bounds.
  if (renderedPointCount === 0) {
    bounds.setFromCenterAndSize(
      new THREE.Vector3(),
      new THREE.Vector3(
        EMPTY_POINT_CLOUD_BOUNDS_SIZE,
        EMPTY_POINT_CLOUD_BOUNDS_SIZE,
        EMPTY_POINT_CLOUD_BOUNDS_SIZE,
      ),
    );
  }

  return {
    bounds,
    colors,
    finitePointCount: heightBounds.finitePointCount,
    positions,
    renderedPointCount,
  };
}

type PointCloudColorSource =
  | {
      readonly kind: "height";
      readonly maxValue: number;
      readonly minValue: number;
    }
  | {
      readonly colors: Float32Array;
      readonly kind: "rgb";
    }
  | {
      readonly kind: "scalar";
      readonly maxValue: number;
      readonly minValue: number;
      readonly values: Float32Array;
    }
  | {
      readonly kind: "uniform";
    };

function resolvePointCloudColorSource({
  colorBy,
  colors,
  heightBounds,
  scalarFields,
  sourcePointCount,
  sourcePositions,
}: {
  readonly colorBy?: PointCloudColorBy;
  readonly colors?: Float32Array;
  readonly heightBounds: ReturnType<typeof computeSourceHeightBounds>;
  readonly scalarFields?: readonly PointCloudScalarField[];
  readonly sourcePointCount: number;
  readonly sourcePositions: Float32Array;
}): PointCloudColorSource {
  if (colorBy && colorBy !== "auto") {
    return (
      requestedColorSource({
        colorBy,
        colors,
        heightBounds,
        scalarFields,
        sourcePointCount,
        sourcePositions,
      }) ?? { kind: "uniform" }
    );
  }

  const rgbSource = rgbColorSource(colors, sourcePointCount);
  if (rgbSource) {
    return rgbSource;
  }

  for (const fieldName of CANONICAL_SCALAR_COLOR_FIELDS) {
    const scalarSource = scalarColorSource(
      sourcePositions,
      sourcePointCount,
      scalarFields,
      fieldName,
    );
    if (scalarSource) {
      return scalarSource;
    }
  }

  return heightColorSource(heightBounds) ?? { kind: "uniform" };
}

function requestedColorSource({
  colorBy,
  colors,
  heightBounds,
  scalarFields,
  sourcePointCount,
  sourcePositions,
}: {
  readonly colorBy: Exclude<PointCloudColorBy, "auto">;
  readonly colors?: Float32Array;
  readonly heightBounds: ReturnType<typeof computeSourceHeightBounds>;
  readonly scalarFields?: readonly PointCloudScalarField[];
  readonly sourcePointCount: number;
  readonly sourcePositions: Float32Array;
}): PointCloudColorSource | null {
  if (colorBy === "uniform") {
    return { kind: "uniform" };
  }

  if (colorBy === "height") {
    return heightColorSource(heightBounds);
  }

  if (colorBy === "rgb") {
    return rgbColorSource(colors, sourcePointCount);
  }

  return scalarColorSource(
    sourcePositions,
    sourcePointCount,
    scalarFields,
    colorBy,
  );
}

function rgbColorSource(
  colors: Float32Array | undefined,
  sourcePointCount: number,
): PointCloudColorSource | null {
  return colors && colors.length >= sourcePointCount * COLOR_COMPONENT_COUNT
    ? { colors, kind: "rgb" }
    : null;
}

function scalarColorSource(
  sourcePositions: Float32Array,
  sourcePointCount: number,
  scalarFields: readonly PointCloudScalarField[] | undefined,
  fieldName: string,
): PointCloudColorSource | null {
  const scalarField = scalarFields?.find(
    (field) => normalizedFieldName(field.name) === fieldName,
  );
  if (!scalarField || scalarField.values.length < sourcePointCount) {
    return null;
  }

  const bounds = computeScalarBounds(sourcePositions, scalarField.values);
  if (!hasUsefulRange(bounds)) {
    return null;
  }

  return {
    kind: "scalar",
    maxValue: bounds.maxValue,
    minValue: bounds.minValue,
    values: scalarField.values,
  };
}

function heightColorSource(
  heightBounds: ReturnType<typeof computeSourceHeightBounds>,
): PointCloudColorSource | null {
  return hasUsefulRange({
    finitePointCount: heightBounds.finitePointCount,
    maxValue: heightBounds.maxHeight,
    minValue: heightBounds.minHeight,
  })
    ? {
        kind: "height",
        maxValue: heightBounds.maxHeight,
        minValue: heightBounds.minHeight,
      }
    : null;
}

function writePointColor(
  target: Float32Array,
  targetOffset: number,
  colorSource: PointCloudColorSource,
  sourcePointIndex: number,
  z: number,
) {
  if (colorSource.kind === "rgb") {
    const sourceOffset = sourcePointIndex * COLOR_COMPONENT_COUNT;
    target[targetOffset] = clamp01(colorSource.colors[sourceOffset]);
    target[targetOffset + 1] = clamp01(colorSource.colors[sourceOffset + 1]);
    target[targetOffset + 2] = clamp01(colorSource.colors[sourceOffset + 2]);
    return;
  }

  if (colorSource.kind === "height") {
    writeHeightColor(
      target,
      targetOffset,
      normalizeValue(z, colorSource.minValue, colorSource.maxValue),
    );
    return;
  }

  if (colorSource.kind === "scalar") {
    const value = colorSource.values[sourcePointIndex];
    if (Number.isFinite(value)) {
      writeHeightColor(
        target,
        targetOffset,
        normalizeValue(value, colorSource.minValue, colorSource.maxValue),
      );
      return;
    }
  }

  writeNeutralColor(target, targetOffset);
}

function computeScalarBounds(
  sourcePositions: Float32Array,
  values: Float32Array,
) {
  let finitePointCount = 0;
  let minValue = Infinity;
  let maxValue = -Infinity;
  const pointCount = Math.min(
    values.length,
    Math.floor(sourcePositions.length / POINT_COMPONENT_COUNT),
  );

  for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
    const positionOffset = pointIndex * POINT_COMPONENT_COUNT;
    const x = sourcePositions[positionOffset];
    const y = sourcePositions[positionOffset + Y_COMPONENT_INDEX];
    const z = sourcePositions[positionOffset + Z_COMPONENT_INDEX];
    const value = values[pointIndex];

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(z) ||
      !Number.isFinite(value)
    ) {
      continue;
    }

    finitePointCount++;
    minValue = Math.min(minValue, value);
    maxValue = Math.max(maxValue, value);
  }

  return {
    finitePointCount,
    maxValue: finitePointCount > 0 ? maxValue : 0,
    minValue: finitePointCount > 0 ? minValue : 0,
  };
}

function hasUsefulRange({
  finitePointCount,
  maxValue,
  minValue,
}: {
  readonly finitePointCount: number;
  readonly maxValue: number;
  readonly minValue: number;
}) {
  return (
    finitePointCount > 0 &&
    Number.isFinite(minValue) &&
    Number.isFinite(maxValue) &&
    maxValue - minValue > HEIGHT_NORMALIZATION_EPSILON
  );
}

function computeSourceHeightBounds(sourcePositions: Float32Array) {
  let finitePointCount = 0;
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  const pointCount = Math.floor(sourcePositions.length / POINT_COMPONENT_COUNT);

  for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
    const offset = pointIndex * POINT_COMPONENT_COUNT;
    const x = sourcePositions[offset];
    const y = sourcePositions[offset + Y_COMPONENT_INDEX];
    const z = sourcePositions[offset + Z_COMPONENT_INDEX];

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      continue;
    }

    finitePointCount++;
    minHeight = Math.min(minHeight, z);
    maxHeight = Math.max(maxHeight, z);
  }

  return {
    finitePointCount,
    maxHeight: finitePointCount > 0 ? maxHeight : 0,
    minHeight: finitePointCount > 0 ? minHeight : 0,
  };
}

function pointCloudObjectTransform(
  frameTransform: PointCloudFrameTransform | undefined,
): PointCloudObjectTransform {
  if (!frameTransform) {
    return {
      position: [0, 0, 0],
      quaternion: [0, 0, 0, 1],
    };
  }

  const { rotation, translation } = frameTransform;
  const length = Math.hypot(rotation.w, rotation.x, rotation.y, rotation.z);
  if (length === 0) {
    return {
      position: [translation.x, translation.y, translation.z],
      quaternion: [0, 0, 0, 1],
    };
  }

  const normalizedRotation = rotation.clone().normalize();
  return {
    position: [translation.x, translation.y, translation.z],
    quaternion: [
      normalizedRotation.x,
      normalizedRotation.y,
      normalizedRotation.z,
      normalizedRotation.w,
    ],
  };
}

/**
 * Combined world-space bounds for all current layers. Each layer's geometry
 * bounds start in its local point-cloud frame, so transforms must be applied
 * before the boxes can be unioned for camera fitting.
 */
function sceneBoundsForLayers(
  layers: readonly PointCloudRenderLayer[],
): THREE.Box3 | null {
  const sceneBounds = new THREE.Box3();
  sceneBounds.makeEmpty();

  for (const { data, layer } of layers) {
    sceneBounds.union(worldBoundsForLayer(data.bounds, layer.frameTransform));
  }

  return sceneBounds.isEmpty() ? null : sceneBounds;
}

/**
 * Converts one layer's local geometry bounds into panel world coordinates.
 * The returned box is cloned so the render data can keep reusing its local
 * bounding box for geometry and future fit calculations.
 */
function worldBoundsForLayer(
  bounds: THREE.Box3,
  frameTransform: PointCloudFrameTransform | undefined,
): THREE.Box3 {
  const transform = pointCloudObjectTransform(frameTransform);
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...transform.position),
    new THREE.Quaternion(...transform.quaternion),
    new THREE.Vector3(1, 1, 1),
  );

  return bounds.clone().applyMatrix4(matrix);
}

/**
 * Frames a bounding box from the panel's default diagonal viewing direction.
 * The radius/FOV calculation places the camera far enough back for the whole
 * box to fit, with padding so points are not pinned to the viewport edge.
 */
function cameraPoseForBounds(
  bounds: THREE.Box3 | null,
): PointCloudCameraPose | null {
  if (!bounds) {
    return null;
  }

  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(EMPTY_POINT_CLOUD_BOUNDS_SIZE, size.length() / 2);
  const fovRad = THREE.MathUtils.degToRad(PERSPECTIVE_POINT_CAMERA.fov);
  const distance = (radius / Math.sin(fovRad / 2)) * CAMERA_FIT_PADDING;
  const direction = new THREE.Vector3(...PERSPECTIVE_POINT_CAMERA.position)
    .normalize()
    .multiplyScalar(distance);
  const position = center.clone().add(direction);

  return {
    position: [position.x, position.y, position.z],
    target: [center.x, center.y, center.z],
  };
}

function writeHeightColor(target: Float32Array, offset: number, value: number) {
  const clamped = Math.max(
    NORMALIZED_HEIGHT_MIN,
    Math.min(NORMALIZED_HEIGHT_MAX, value),
  );
  const warm =
    clamped > HEIGHT_COLOR_MIDPOINT
      ? (clamped - HEIGHT_COLOR_MIDPOINT) * HEIGHT_COLOR_SCALE
      : NORMALIZED_HEIGHT_MIN;
  const cool =
    clamped < HEIGHT_COLOR_MIDPOINT
      ? clamped * HEIGHT_COLOR_SCALE
      : NORMALIZED_HEIGHT_MAX;

  target[offset + X_COMPONENT_INDEX] =
    HEIGHT_COLOR_RED_BASE + warm * HEIGHT_COLOR_RED_RANGE;
  target[offset + Y_COMPONENT_INDEX] =
    HEIGHT_COLOR_GREEN_BASE + cool * HEIGHT_COLOR_GREEN_RANGE;
  target[offset + Z_COMPONENT_INDEX] =
    HEIGHT_COLOR_BLUE_BASE - warm * HEIGHT_COLOR_BLUE_WARM_RANGE;
}

function writeNeutralColor(target: Float32Array, offset: number) {
  target[offset] = NEUTRAL_POINT_COLOR[0];
  target[offset + 1] = NEUTRAL_POINT_COLOR[1];
  target[offset + 2] = NEUTRAL_POINT_COLOR[2];
}

function normalizeValue(value: number, min: number, max: number) {
  const span = Math.max(max - min, HEIGHT_NORMALIZATION_EPSILON);

  return (value - min) / span;
}

function normalizedFieldName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function pointCountLabel(finitePointCount: number, declaredPointCount: number) {
  if (declaredPointCount > 0 && declaredPointCount !== finitePointCount) {
    return `${formatCount(finitePointCount)} / ${formatCount(
      declaredPointCount,
    )} pts`;
  }

  return `${formatCount(finitePointCount)} pts`;
}

function formatCount(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

const styles: Record<string, CSSProperties> = {
  canvas: {
    display: "block",
    height: "100%",
    width: "100%",
  },
  focusButton: {
    alignItems: "center",
    background: VISUALIZATION_HUD_BACKGROUND_COLOR,
    border: `1px solid ${VISUALIZATION_HUD_BORDER_COLOR}`,
    borderRadius: HUD_BORDER_RADIUS_PX,
    color: VISUALIZATION_HUD_TEXT_COLOR,
    cursor: "pointer",
    display: "inline-flex",
    height: 24,
    justifyContent: "center",
    padding: 0,
    width: 24,
  },
  focusButtonIcon: {
    flex: "0 0 auto",
    height: 13,
    width: 13,
  },
  hud: {
    background: VISUALIZATION_HUD_BACKGROUND_COLOR,
    border: `1px solid ${VISUALIZATION_HUD_BORDER_COLOR}`,
    borderRadius: HUD_BORDER_RADIUS_PX,
    color: VISUALIZATION_HUD_TEXT_COLOR,
    fontSize: HUD_FONT_SIZE_PX,
    lineHeight: HUD_LINE_HEIGHT,
    padding: "5px 7px",
    position: "absolute",
    right: HUD_OFFSET_PX,
    top: HUD_OFFSET_PX,
  },
  panel: {
    background: VISUALIZATION_PANEL_BACKGROUND_COLOR,
    boxSizing: "border-box",
    height: "100%",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  status: {
    alignItems: "center",
    color: VISUALIZATION_STATUS_TEXT_COLOR,
    display: "flex",
    fontSize: STATUS_FONT_SIZE_PX,
    inset: 0,
    justifyContent: "center",
    padding: STATUS_PADDING_PX,
    position: "absolute",
    textAlign: "center",
  },
  focusControls: {
    alignItems: "flex-start",
    display: "flex",
    gap: 6,
    left: HUD_OFFSET_PX,
    position: "absolute",
    top: HUD_OFFSET_PX,
  },
  warning: {
    background: VISUALIZATION_HUD_BACKGROUND_COLOR,
    border: `1px solid ${VISUALIZATION_HUD_BORDER_COLOR}`,
    borderRadius: HUD_BORDER_RADIUS_PX,
    bottom: HUD_OFFSET_PX,
    color: VISUALIZATION_HUD_TEXT_COLOR,
    fontSize: HUD_FONT_SIZE_PX,
    left: HUD_OFFSET_PX,
    lineHeight: 1.2,
    maxWidth: "calc(100% - 16px)",
    padding: "5px 7px",
    position: "absolute",
  },
};
