/* eslint-disable react/no-unknown-property */
import { useThree } from "@react-three/fiber";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";

import type { PointCloudVisualization } from "../../decoders";
import { Base3DScene } from "./base-3d-scene";
import {
  VISUALIZATION_HUD_BACKGROUND_COLOR,
  VISUALIZATION_HUD_BORDER_COLOR,
  VISUALIZATION_HUD_TEXT_COLOR,
  VISUALIZATION_PANEL_BACKGROUND_COLOR,
  VISUALIZATION_STATUS_TEXT_COLOR,
} from "./style-tokens";
import { WebGpuCanvas } from "./webgpu-canvas";

const PERSPECTIVE_POINT_CAMERA = {
  far: 10000,
  fov: 50,
  near: 0.01,
  position: [8, 5, 8] as [number, number, number],
};
const DEFAULT_MAX_RENDERED_POINTS = 120_000;
const DEFAULT_POINT_SIZE = 2;
const EMPTY_POINT_CLOUD_BOUNDS_SIZE = 1;
const MIN_POINT_SAMPLE_COUNT = 1;
const NORMALIZED_HEIGHT_MIN = 0;
const NORMALIZED_HEIGHT_MAX = 1;
const POINT_COMPONENT_COUNT = 3;
const X_COMPONENT_INDEX = 0;
const Y_COMPONENT_INDEX = 1;
const Z_COMPONENT_INDEX = 2;
const HEIGHT_COLOR_MIDPOINT = 0.5;
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

interface PointCloudRenderData {
  readonly bounds: THREE.Box3;
  readonly colors: Float32Array;
  readonly finitePointCount: number;
  readonly positions: Float32Array;
  readonly renderedPointCount: number;
}

/**
 * Transform from a point-cloud frame into the panel's fixed frame.
 */
export interface PointCloudFrameTransform {
  readonly rotation: {
    readonly w: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly sourceFrameId: string;
  readonly targetFrameId: string;
  readonly translation: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
}

/**
 * Props for rendering one decoded point-cloud visualization frame.
 */
export interface PointCloudPanelProps {
  readonly className?: string;
  readonly fit?: "initial" | "frame" | "never";
  readonly frame: PointCloudVisualization;
  readonly frameTransform?: PointCloudFrameTransform;
  readonly maxRenderedPoints?: number;
  readonly pointSize?: number;
  readonly showHud?: boolean;
  readonly style?: CSSProperties;
  readonly warning?: string | null;
}

/**
 * Production point-cloud visualization panel backed by a stable Three.js canvas.
 */
export function PointCloudPanel({
  className,
  fit = "initial",
  frame,
  frameTransform,
  maxRenderedPoints = DEFAULT_MAX_RENDERED_POINTS,
  pointSize = DEFAULT_POINT_SIZE,
  showHud = true,
  style,
  warning = null,
}: PointCloudPanelProps) {
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const [finitePointCount, setFinitePointCount] = useState(0);
  const scene = useMemo(
    () => (
      <PointCloudSceneContent
        fit={fit}
        maxRenderedPoints={maxRenderedPoints}
        onFinitePointCount={setFinitePointCount}
        pointSize={pointSize}
        positions={frame.positions}
        transform={frameTransform}
      />
    ),
    [fit, frame.positions, frameTransform, maxRenderedPoints, pointSize]
  );

  return (
    <div className={className} style={{ ...styles.panel, ...style }}>
      <WebGpuCanvas
        camera={PERSPECTIVE_POINT_CAMERA}
        onError={setCanvasError}
        role="img"
        style={styles.canvas}
      >
        {scene}
      </WebGpuCanvas>

      {canvasError ? (
        <div style={styles.status}>{canvasError}</div>
      ) : finitePointCount === 0 ? (
        <div style={styles.status}>No finite points</div>
      ) : showHud ? (
        <div style={styles.hud}>
          {pointCountLabel(finitePointCount, frame.pointCount)}
        </div>
      ) : null}
      {warning ? <div style={styles.warning}>{warning}</div> : null}
    </div>
  );
}

function PointCloudSceneContent({
  fit: _fit,
  maxRenderedPoints,
  onFinitePointCount,
  pointSize,
  positions,
  transform,
}: {
  readonly fit: "initial" | "frame" | "never";
  readonly maxRenderedPoints: number;
  readonly onFinitePointCount: (count: number) => void;
  readonly pointSize: number;
  readonly positions: Float32Array;
  readonly transform: PointCloudFrameTransform | undefined;
}) {
  const data = useMemo(
    () => buildPointCloudRenderData(positions, maxRenderedPoints, transform),
    [maxRenderedPoints, positions, transform]
  );

  useEffect(() => {
    onFinitePointCount(data.finitePointCount);
  }, [data.finitePointCount, onFinitePointCount]);

  return (
    <Base3DScene>
      <PointCloudPoints data={data} pointSize={pointSize} />
    </Base3DScene>
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

  useEffect(() => {
    invalidate();
    return () => geometry.dispose();
  }, [geometry, invalidate]);

  return (
    <points frustumCulled={false} geometry={geometry}>
      <pointsMaterial size={pointSize} sizeAttenuation={false} vertexColors />
    </points>
  );
}

function createPointCloudGeometry(data: PointCloudRenderData) {
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(
    data.positions,
    POINT_COMPONENT_COUNT
  );
  const colorAttribute = new THREE.BufferAttribute(
    data.colors,
    POINT_COMPONENT_COUNT
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
  frameTransform: PointCloudFrameTransform | undefined
): PointCloudRenderData {
  const sourcePointCount = Math.floor(
    sourcePositions.length / POINT_COMPONENT_COUNT
  );
  const sampleEvery = Math.max(
    MIN_POINT_SAMPLE_COUNT,
    Math.ceil(
      sourcePointCount / Math.max(MIN_POINT_SAMPLE_COUNT, maxRenderedPoints)
    )
  );
  const maxSampleCount = Math.max(
    MIN_POINT_SAMPLE_COUNT,
    Math.ceil(sourcePointCount / sampleEvery)
  );
  const positions = new Float32Array(maxSampleCount * POINT_COMPONENT_COUNT);
  const colors = new Float32Array(maxSampleCount * POINT_COMPONENT_COUNT);
  const normalizedTransform = normalizeFrameTransform(frameTransform);
  const heightBounds = computeSourceHeightBounds(
    sourcePositions,
    normalizedTransform
  );
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

    const point = transformPoint(x, y, z, normalizedTransform);
    const targetOffset = renderedPointCount * POINT_COMPONENT_COUNT;
    positions[targetOffset + X_COMPONENT_INDEX] = point.x;
    positions[targetOffset + Y_COMPONENT_INDEX] = point.z;
    positions[targetOffset + Z_COMPONENT_INDEX] = -point.y;
    writeHeightColor(
      colors,
      targetOffset,
      normalizeHeight(point.z, heightBounds.minHeight, heightBounds.maxHeight)
    );
    tmpVec.set(
      positions[targetOffset + X_COMPONENT_INDEX],
      positions[targetOffset + Y_COMPONENT_INDEX],
      positions[targetOffset + Z_COMPONENT_INDEX]
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
        EMPTY_POINT_CLOUD_BOUNDS_SIZE
      )
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

function computeSourceHeightBounds(
  sourcePositions: Float32Array,
  frameTransform: PointCloudFrameTransform | undefined
) {
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

    const point = transformPoint(x, y, z, frameTransform);
    finitePointCount++;
    minHeight = Math.min(minHeight, point.z);
    maxHeight = Math.max(maxHeight, point.z);
  }

  return {
    finitePointCount,
    maxHeight: finitePointCount > 0 ? maxHeight : 0,
    minHeight: finitePointCount > 0 ? minHeight : 0,
  };
}

function transformPoint(
  x: number,
  y: number,
  z: number,
  frameTransform: PointCloudFrameTransform | undefined
) {
  if (!frameTransform) {
    return { x, y, z };
  }

  const { rotation, translation } = frameTransform;
  const ix = rotation.w * x + rotation.y * z - rotation.z * y;
  const iy = rotation.w * y + rotation.z * x - rotation.x * z;
  const iz = rotation.w * z + rotation.x * y - rotation.y * x;
  const iw = -rotation.x * x - rotation.y * y - rotation.z * z;

  return {
    x:
      ix * rotation.w +
      iw * -rotation.x +
      iy * -rotation.z -
      iz * -rotation.y +
      translation.x,
    y:
      iy * rotation.w +
      iw * -rotation.y +
      iz * -rotation.x -
      ix * -rotation.z +
      translation.y,
    z:
      iz * rotation.w +
      iw * -rotation.z +
      ix * -rotation.y -
      iy * -rotation.x +
      translation.z,
  };
}

function normalizeFrameTransform(
  frameTransform: PointCloudFrameTransform | undefined
): PointCloudFrameTransform | undefined {
  if (!frameTransform) {
    return undefined;
  }

  const { rotation } = frameTransform;
  const length = Math.hypot(rotation.w, rotation.x, rotation.y, rotation.z);
  if (length === 0) {
    return {
      ...frameTransform,
      rotation: { w: 1, x: 0, y: 0, z: 0 },
    };
  }

  return {
    ...frameTransform,
    rotation: {
      w: rotation.w / length,
      x: rotation.x / length,
      y: rotation.y / length,
      z: rotation.z / length,
    },
  };
}

function writeHeightColor(target: Float32Array, offset: number, value: number) {
  const clamped = Math.max(
    NORMALIZED_HEIGHT_MIN,
    Math.min(NORMALIZED_HEIGHT_MAX, value)
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

function normalizeHeight(value: number, min: number, max: number) {
  const span = Math.max(max - min, HEIGHT_NORMALIZATION_EPSILON);

  return (value - min) / span;
}

function pointCountLabel(finitePointCount: number, declaredPointCount: number) {
  if (declaredPointCount > 0 && declaredPointCount !== finitePointCount) {
    return `${formatCount(finitePointCount)} / ${formatCount(
      declaredPointCount
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
