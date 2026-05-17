/* eslint-disable react/no-unknown-property */
import { useThree } from "@react-three/fiber";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";

import type { PointCloudVisualization } from "../../decoders";
import { Base3DScene } from "./base-3d-scene";
import { WebGpuCanvas } from "./webgpu-canvas";

const PERSPECTIVE_POINT_CAMERA = {
  far: 10000,
  fov: 50,
  near: 0.01,
  position: [8, 5, 8] as [number, number, number],
};

interface PointCloudRenderData {
  readonly bounds: THREE.Box3;
  readonly colors: Float32Array;
  readonly finitePointCount: number;
  readonly positions: Float32Array;
  readonly renderedPointCount: number;
}

/**
 * Props for rendering one decoded point-cloud visualization frame.
 */
export interface PointCloudPanelProps {
  readonly className?: string;
  readonly fit?: "initial" | "frame" | "never";
  readonly frame: PointCloudVisualization;
  readonly maxRenderedPoints?: number;
  readonly pointSize?: number;
  readonly showHud?: boolean;
  readonly style?: CSSProperties;
}

/**
 * Production point-cloud visualization panel backed by a stable Three.js canvas.
 */
export function PointCloudPanel({
  className,
  fit = "initial",
  frame,
  maxRenderedPoints = 120000,
  pointSize = 2,
  showHud = true,
  style,
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
      />
    ),
    [fit, frame.positions, maxRenderedPoints, pointSize]
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
    </div>
  );
}

function PointCloudSceneContent({
  fit: _fit,
  maxRenderedPoints,
  onFinitePointCount,
  pointSize,
  positions,
}: {
  readonly fit: "initial" | "frame" | "never";
  readonly maxRenderedPoints: number;
  readonly onFinitePointCount: (count: number) => void;
  readonly pointSize: number;
  readonly positions: Float32Array;
}) {
  const data = useMemo(
    () => buildPointCloudRenderData(positions, maxRenderedPoints),
    [maxRenderedPoints, positions]
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
  const positionAttribute = new THREE.BufferAttribute(data.positions, 3);
  const colorAttribute = new THREE.BufferAttribute(data.colors, 3);
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
  maxRenderedPoints: number
): PointCloudRenderData {
  const sourcePointCount = Math.floor(sourcePositions.length / 3);
  const sampleEvery = Math.max(
    1,
    Math.ceil(sourcePointCount / Math.max(1, maxRenderedPoints))
  );
  const maxSampleCount = Math.max(1, Math.ceil(sourcePointCount / sampleEvery));
  const positions = new Float32Array(maxSampleCount * 3);
  const colors = new Float32Array(maxSampleCount * 3);
  const heightBounds = computeSourceHeightBounds(sourcePositions);
  const bounds = new THREE.Box3();
  let renderedPointCount = 0;

  bounds.makeEmpty();

  for (
    let sourcePointIndex = 0;
    sourcePointIndex < sourcePointCount;
    sourcePointIndex += sampleEvery
  ) {
    const sourceOffset = sourcePointIndex * 3;
    const x = sourcePositions[sourceOffset];
    const y = sourcePositions[sourceOffset + 1];
    const z = sourcePositions[sourceOffset + 2];

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      continue;
    }

    const targetOffset = renderedPointCount * 3;
    positions[targetOffset] = x;
    positions[targetOffset + 1] = z;
    positions[targetOffset + 2] = -y;
    writeHeightColor(
      colors,
      targetOffset,
      normalizeHeight(z, heightBounds.minHeight, heightBounds.maxHeight)
    );
    bounds.expandByPoint(
      new THREE.Vector3(
        positions[targetOffset],
        positions[targetOffset + 1],
        positions[targetOffset + 2]
      )
    );
    renderedPointCount++;
  }

  if (heightBounds.finitePointCount === 0) {
    bounds.setFromCenterAndSize(
      new THREE.Vector3(),
      new THREE.Vector3(1, 1, 1)
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

function computeSourceHeightBounds(sourcePositions: Float32Array) {
  let finitePointCount = 0;
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  const pointCount = Math.floor(sourcePositions.length / 3);

  for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
    const offset = pointIndex * 3;
    const x = sourcePositions[offset];
    const y = sourcePositions[offset + 1];
    const z = sourcePositions[offset + 2];

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

function writeHeightColor(target: Float32Array, offset: number, value: number) {
  const clamped = Math.max(0, Math.min(1, value));
  const warm = clamped > 0.5 ? (clamped - 0.5) * 2 : 0;
  const cool = clamped < 0.5 ? clamped * 2 : 1;

  target[offset] = 0.25 + warm * 0.75;
  target[offset + 1] = 0.55 + cool * 0.35;
  target[offset + 2] = 1 - warm * 0.48;
}

function normalizeHeight(value: number, min: number, max: number) {
  const span = Math.max(max - min, 0.000001);

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
    background: "rgba(5, 11, 18, 0.76)",
    border: "1px solid rgba(148, 163, 184, 0.22)",
    borderRadius: 4,
    color: "#cbd5e1",
    fontSize: 11,
    lineHeight: 1,
    padding: "5px 7px",
    position: "absolute",
    right: 8,
    top: 8,
  },
  panel: {
    background: "#050b12",
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
    color: "#9fb3c8",
    display: "flex",
    fontSize: 13,
    inset: 0,
    justifyContent: "center",
    padding: 16,
    position: "absolute",
    textAlign: "center",
  },
};
