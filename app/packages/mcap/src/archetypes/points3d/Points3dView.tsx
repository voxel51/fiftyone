import {
  Billboard,
  GizmoHelper,
  GizmoViewport,
  Grid,
  Html,
  OrbitControls,
} from "@react-three/drei";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import React from "react";
import * as THREE from "three";
import { WebGpuCanvas } from "../shared/WebGpuCanvas";
import {
  computePointSize,
  createIntensityColorBuffer,
  fitPerspectiveCameraToBounds,
} from "./helpers";
import type {
  Points3dBounds,
  Points3dViewProps,
  Scene3dFrame,
  Scene3dInstancePrimitive,
  Scene3dLinePrimitive,
  Scene3dPointsPrimitive,
  Scene3dPrimitive,
} from "./types";

const VIEWPORT_STYLES: React.CSSProperties = {
  width: "100%",
  height: "100%",
};

const CANVAS_STYLES: React.CSSProperties = {
  width: "100%",
  height: "100%",
};

const TOOLTIP_CARD_STYLES: React.CSSProperties = {
  minWidth: 140,
  maxWidth: 220,
  borderRadius: 10,
  padding: "10px 12px",
  color: "#f8fafc",
  background: "rgba(17, 24, 39, 0.92)",
  border: "1px solid rgba(148, 163, 184, 0.28)",
  boxShadow: "0 14px 32px rgba(15, 23, 42, 0.38)",
  pointerEvents: "none",
};

const TOOLTIP_TITLE_ROW_STYLES: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 6,
};

const TOOLTIP_SWATCH_STYLES: React.CSSProperties = {
  width: 9,
  height: 9,
  borderRadius: "999px",
  flexShrink: 0,
};

const TOOLTIP_TITLE_STYLES: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.3,
};

const TOOLTIP_ENTRY_STYLES: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "max-content 1fr",
  columnGap: 8,
  rowGap: 3,
  fontSize: 11,
  lineHeight: 1.35,
};

const TOOLTIP_LABEL_STYLES: React.CSSProperties = {
  color: "rgba(226, 232, 240, 0.72)",
  textTransform: "lowercase",
};

const TOOLTIP_VALUE_STYLES: React.CSSProperties = {
  color: "#ffffff",
  wordBreak: "break-word",
};

type ControlsHandle = {
  target: THREE.Vector3;
  update: () => void;
};

type FollowPoseSnapshot = NonNullable<Points3dViewProps["followPose"]>;
type PrimitiveHoverHandlers = {
  onPointerOut?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerOver?: (event: ThreeEvent<PointerEvent>) => void;
};

const GRID_CELL_SIZE = 1;
const GRID_CELL_COLOR = "#314252";
const GRID_SECTION_COLOR = "#6f8aa5";
const GRID_CELL_TARGET_DIVISOR = 20;
const GRID_SECTION_MULTIPLIER = 10;
const GRID_FADE_MULTIPLIER = 12;
const GRID_MIN_FADE_DISTANCE = 80;
const GRID_MIN_SIZE = 16;
const GIZMO_MARGIN = [52, 50] as const;
const DEFAULT_EGO_FOLLOW_SEED_OFFSET = new THREE.Vector3(-3, -3, 2);

type ViewUpAxis = NonNullable<Points3dViewProps["upAxis"]>;

function getAxisIndex(upAxis: ViewUpAxis) {
  if (upAxis === "x") {
    return 0;
  }

  if (upAxis === "z") {
    return 2;
  }

  return 1;
}

function getNiceGridStep(target: number) {
  if (!Number.isFinite(target) || target <= 0) {
    return GRID_CELL_SIZE;
  }

  const magnitude = 10 ** Math.floor(Math.log10(target));
  const normalized = target / magnitude;

  if (normalized > 5) {
    return 10 * magnitude;
  }

  if (normalized > 2) {
    return 5 * magnitude;
  }

  if (normalized > 1) {
    return 2 * magnitude;
  }

  return magnitude;
}

function getSnappedGridLevel(value: number, sectionSize: number) {
  return Math.floor(value / sectionSize) * sectionSize;
}

function getGridRotation(upAxis: ViewUpAxis) {
  if (upAxis === "x") {
    return [0, 0, Math.PI / 2] as const;
  }

  if (upAxis === "z") {
    return [Math.PI / 2, 0, 0] as const;
  }

  return [0, 0, 0] as const;
}

function getUpVectorTuple(upAxis: ViewUpAxis) {
  if (upAxis === "x") {
    return [1, 0, 0] as const;
  }

  if (upAxis === "z") {
    return [0, 0, 1] as const;
  }

  return [0, 1, 0] as const;
}

function getMaxPlaneSpan(bounds: Points3dBounds, upAxis: ViewUpAxis) {
  const xSpan = bounds.max[0] - bounds.min[0];
  const ySpan = bounds.max[1] - bounds.min[1];
  const zSpan = bounds.max[2] - bounds.min[2];

  if (upAxis === "x") {
    return Math.max(ySpan, zSpan);
  }

  if (upAxis === "z") {
    return Math.max(xSpan, ySpan);
  }

  return Math.max(xSpan, zSpan);
}

function getPrimitiveAnchorPosition(primitive: Scene3dPrimitive) {
  if (!primitive.positions.length) {
    return null;
  }

  let minX = primitive.positions[0];
  let minY = primitive.positions[1];
  let minZ = primitive.positions[2];
  let maxX = primitive.positions[0];
  let maxY = primitive.positions[1];
  let maxZ = primitive.positions[2];

  for (let index = 3; index < primitive.positions.length; index += 3) {
    const x = primitive.positions[index];
    const y = primitive.positions[index + 1];
    const z = primitive.positions[index + 2];

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  return [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2] as [
    number,
    number,
    number
  ];
}

function setGeometryAttribute(
  geometry: THREE.BufferGeometry,
  attributeName: string,
  array: Float32Array,
  itemSize: number
) {
  const existingAttribute = geometry.getAttribute(attributeName);

  if (
    existingAttribute instanceof THREE.BufferAttribute &&
    existingAttribute.itemSize === itemSize &&
    existingAttribute.array instanceof Float32Array &&
    existingAttribute.array.length === array.length
  ) {
    existingAttribute.array.set(array);
    existingAttribute.needsUpdate = true;
    return;
  }

  const nextAttribute = new THREE.BufferAttribute(
    new Float32Array(array),
    itemSize
  );
  nextAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute(attributeName, nextAttribute);
}

function clearGeometryAttribute(
  geometry: THREE.BufferGeometry,
  attributeName: string
) {
  if (geometry.getAttribute(attributeName)) {
    geometry.deleteAttribute(attributeName);
  }
}

function SceneGrid({
  bounds,
  anchorToken,
  upAxis,
}: {
  bounds: Points3dBounds;
  anchorToken: Points3dViewProps["resetViewToken"];
  upAxis: ViewUpAxis;
}) {
  const currentMaxPlaneSpan = React.useMemo(
    () => getMaxPlaneSpan(bounds, upAxis),
    [bounds, upAxis]
  );
  const axisIndex = React.useMemo(() => getAxisIndex(upAxis), [upAxis]);
  const gridAnchorKey = React.useMemo(() => {
    return `${String(anchorToken ?? "default")}:${upAxis}`;
  }, [anchorToken, upAxis]);
  const gridAnchorRef = React.useRef<{
    gridAnchorKey: string;
    maxPlaneSpan: number;
    snappedLevel: number;
  } | null>(null);

  const gridAnchor = React.useMemo(() => {
    const previousGridAnchor = gridAnchorRef.current;

    if (
      !previousGridAnchor ||
      previousGridAnchor.gridAnchorKey !== gridAnchorKey
    ) {
      const initialCellSize = getNiceGridStep(
        currentMaxPlaneSpan / GRID_CELL_TARGET_DIVISOR
      );
      const initialSectionSize = initialCellSize * GRID_SECTION_MULTIPLIER;
      const nextGridAnchor = {
        gridAnchorKey,
        maxPlaneSpan: currentMaxPlaneSpan,
        snappedLevel: getSnappedGridLevel(
          bounds.min[axisIndex],
          initialSectionSize
        ),
      };

      gridAnchorRef.current = nextGridAnchor;
      return nextGridAnchor;
    }

    const nextMaxPlaneSpan = Math.max(
      previousGridAnchor.maxPlaneSpan,
      currentMaxPlaneSpan
    );

    if (nextMaxPlaneSpan === previousGridAnchor.maxPlaneSpan) {
      return previousGridAnchor;
    }

    const nextGridAnchor = {
      ...previousGridAnchor,
      maxPlaneSpan: nextMaxPlaneSpan,
    };

    gridAnchorRef.current = nextGridAnchor;
    return nextGridAnchor;
  }, [axisIndex, bounds.min, currentMaxPlaneSpan, gridAnchorKey]);

  const cellSize = React.useMemo(() => {
    return getNiceGridStep(gridAnchor.maxPlaneSpan / GRID_CELL_TARGET_DIVISOR);
  }, [gridAnchor.maxPlaneSpan]);
  const sectionSize = React.useMemo(() => {
    return cellSize * GRID_SECTION_MULTIPLIER;
  }, [cellSize]);
  const fadeDistance = React.useMemo(() => {
    return Math.max(
      sectionSize * GRID_FADE_MULTIPLIER,
      gridAnchor.maxPlaneSpan * 4,
      GRID_MIN_FADE_DISTANCE
    );
  }, [gridAnchor.maxPlaneSpan, sectionSize]);
  const gridSize = React.useMemo(() => {
    return Math.max(sectionSize * GRID_MIN_SIZE, gridAnchor.maxPlaneSpan * 2);
  }, [gridAnchor.maxPlaneSpan, sectionSize]);
  const position = React.useMemo(() => {
    const snappedLevel = gridAnchor.snappedLevel;

    if (upAxis === "x") {
      return [snappedLevel, 0, 0] as const;
    }

    if (upAxis === "z") {
      return [0, 0, snappedLevel] as const;
    }

    return [0, snappedLevel, 0] as const;
  }, [gridAnchor.snappedLevel, upAxis]);

  const rotation = React.useMemo(() => getGridRotation(upAxis), [upAxis]);

  return (
    <Grid
      args={[gridSize, gridSize]}
      cellColor={GRID_CELL_COLOR}
      cellSize={cellSize}
      cellThickness={0.5}
      fadeDistance={fadeDistance}
      fadeFrom={0.4}
      fadeStrength={1}
      infiniteGrid
      position={position}
      rotation={rotation}
      sectionColor={GRID_SECTION_COLOR}
      sectionSize={sectionSize}
      sectionThickness={0.9}
      side={THREE.DoubleSide}
    />
  );
}

function SceneViewportGizmo() {
  return (
    <GizmoHelper alignment="top-left" margin={GIZMO_MARGIN}>
      <GizmoViewport />
    </GizmoHelper>
  );
}

function Points3dCameraController({
  followPose,
  bounds,
  preserveViewOnFrameChange,
  resetViewToken,
  upAxis,
}: {
  bounds: Points3dBounds;
  followPose: Points3dViewProps["followPose"];
  preserveViewOnFrameChange: boolean;
  resetViewToken: Points3dViewProps["resetViewToken"];
  upAxis: ViewUpAxis;
}) {
  const { camera, invalidate } = useThree();
  const controlsRef = React.useRef<ControlsHandle | null>(null);
  const lastFrameKeyRef = React.useRef<string | null>(null);
  const lastResetTokenRef =
    React.useRef<Points3dViewProps["resetViewToken"]>(undefined);
  const lastFollowPoseRef = React.useRef<FollowPoseSnapshot | null>(null);
  const needsFreshFollowSeedRef = React.useRef(false);
  const upVector = React.useMemo(() => {
    const [x, y, z] = getUpVectorTuple(upAxis);
    return new THREE.Vector3(x, y, z);
  }, [upAxis]);

  const frameKey = React.useMemo(() => {
    return `${bounds.min.join(",")}:${bounds.max.join(",")}`;
  }, [bounds]);

  React.useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera) || !frameKey) {
      return;
    }

    camera.up.copy(upVector);

    const shouldReset =
      lastFrameKeyRef.current === null ||
      resetViewToken !== lastResetTokenRef.current ||
      (!preserveViewOnFrameChange && lastFrameKeyRef.current !== frameKey);
    needsFreshFollowSeedRef.current = shouldReset;

    if (!shouldReset) {
      controlsRef.current?.update();
      lastFrameKeyRef.current = frameKey;
      return;
    }

    fitPerspectiveCameraToBounds(camera, controlsRef.current, bounds);
    lastFrameKeyRef.current = frameKey;
    lastResetTokenRef.current = resetViewToken;
    invalidate();
  }, [
    bounds,
    camera,
    frameKey,
    invalidate,
    preserveViewOnFrameChange,
    resetViewToken,
    upVector,
  ]);

  React.useEffect(() => {
    if (!followPose) {
      lastFollowPoseRef.current = null;
      return;
    }

    if (
      !(camera instanceof THREE.PerspectiveCamera) ||
      !controlsRef.current ||
      !followPose
    ) {
      return;
    }

    const target = new THREE.Vector3(...followPose.position);
    const previousTarget = controlsRef.current.target.clone();
    const currentOffset = camera.position.clone().sub(previousTarget);
    const previousFollowPose = lastFollowPoseRef.current;
    const shouldSeedFromDefault =
      previousFollowPose === null || needsFreshFollowSeedRef.current;
    let nextOffset = shouldSeedFromDefault
      ? DEFAULT_EGO_FOLLOW_SEED_OFFSET.clone()
      : currentOffset.lengthSq()
      ? currentOffset
      : DEFAULT_EGO_FOLLOW_SEED_OFFSET.clone();

    if (followPose.orientation) {
      const currentOrientation = new THREE.Quaternion(
        ...followPose.orientation
      );
      const localOffset = shouldSeedFromDefault
        ? DEFAULT_EGO_FOLLOW_SEED_OFFSET.clone()
        : previousFollowPose?.orientation && currentOffset.lengthSq()
        ? currentOffset.applyQuaternion(
            new THREE.Quaternion(...previousFollowPose.orientation).invert()
          )
        : DEFAULT_EGO_FOLLOW_SEED_OFFSET.clone();
      nextOffset = localOffset.applyQuaternion(currentOrientation);
    }

    camera.up.copy(upVector);
    camera.position.copy(target.clone().add(nextOffset));
    controlsRef.current.target.copy(target);
    controlsRef.current.update();
    lastFollowPoseRef.current = followPose;
    needsFreshFollowSeedRef.current = false;
    invalidate();
  }, [camera, followPose, frameKey, invalidate, resetViewToken, upVector]);

  return <OrbitControls makeDefault ref={controlsRef as never} />;
}

function SceneAnnotationTooltip({
  primitive,
}: {
  primitive: Scene3dPrimitive;
}) {
  const position = React.useMemo(() => {
    return getPrimitiveAnchorPosition(primitive);
  }, [primitive]);

  if (!primitive.semantic || !position) {
    return null;
  }

  return (
    <Billboard position={position}>
      <Html center pointerEvents="none">
        <div data-testid="points3d-hover-tooltip" style={TOOLTIP_CARD_STYLES}>
          <div style={TOOLTIP_TITLE_ROW_STYLES}>
            <span
              style={{
                ...TOOLTIP_SWATCH_STYLES,
                background: primitive.solidColor ?? "#ffffff",
              }}
            />
            <span style={TOOLTIP_TITLE_STYLES}>{primitive.semantic.title}</span>
          </div>
          {primitive.semantic.entries.length ? (
            <div style={TOOLTIP_ENTRY_STYLES}>
              {primitive.semantic.entries.map((entry) => (
                <React.Fragment key={`${entry.label}:${entry.value}`}>
                  <span style={TOOLTIP_LABEL_STYLES}>{entry.label}</span>
                  <span style={TOOLTIP_VALUE_STYLES}>{entry.value}</span>
                </React.Fragment>
              ))}
            </div>
          ) : null}
        </div>
      </Html>
    </Billboard>
  );
}

function PointsPrimitive({
  colorMode,
  frameBounds,
  hoverHandlers,
  isHovered,
  primitive,
  solidColor,
}: {
  colorMode: NonNullable<Points3dViewProps["colorMode"]>;
  frameBounds: Scene3dFrame["bounds"];
  hoverHandlers?: PrimitiveHoverHandlers;
  isHovered: boolean;
  primitive: Scene3dPointsPrimitive;
  solidColor: string;
}) {
  const colorBuffer = React.useMemo(() => {
    if (colorMode === "intensity" && primitive.intensity?.length) {
      return createIntensityColorBuffer(primitive.intensity);
    }

    if (colorMode !== "intensity" && primitive.colors?.length) {
      return primitive.colors;
    }

    return null;
  }, [colorMode, primitive.colors, primitive.intensity]);
  const geometryShapeKey = React.useMemo(() => {
    return `${primitive.positions.length}:${colorBuffer?.length ?? 0}`;
  }, [colorBuffer?.length, primitive.positions.length]);
  const geometry = React.useMemo(() => {
    return new THREE.BufferGeometry();
  }, [geometryShapeKey]);

  React.useLayoutEffect(() => {
    // Three/WebGPU can update a vertex buffer in place, but it cannot safely
    // grow the bound GPU buffer without recreating the geometry/attribute.
    setGeometryAttribute(geometry, "position", primitive.positions, 3);

    if (colorBuffer?.length) {
      setGeometryAttribute(geometry, "color", colorBuffer, 3);
    } else {
      clearGeometryAttribute(geometry, "color");
    }

    geometry.computeBoundingSphere();
  }, [colorBuffer, geometry, primitive.positions]);

  React.useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  return (
    <points geometry={geometry} {...hoverHandlers}>
      <pointsMaterial
        color={primitive.solidColor ?? solidColor}
        opacity={isHovered ? 1 : 0.95}
        size={
          (primitive.pointSize ?? computePointSize(frameBounds)) *
          (isHovered ? 1.2 : 1)
        }
        sizeAttenuation
        transparent
        vertexColors={Boolean(
          (colorMode === "intensity" && primitive.intensity?.length) ||
            (colorMode !== "intensity" && primitive.colors?.length)
        )}
      />
    </points>
  );
}

function LinePrimitive({
  hoverHandlers,
  isHovered,
  primitive,
}: {
  hoverHandlers?: PrimitiveHoverHandlers;
  isHovered: boolean;
  primitive: Scene3dLinePrimitive;
}) {
  const geometryShapeKey = React.useMemo(() => {
    return `${primitive.positions.length}:${primitive.colors?.length ?? 0}`;
  }, [primitive.colors?.length, primitive.positions.length]);
  const geometry = React.useMemo(() => {
    return new THREE.BufferGeometry();
  }, [geometryShapeKey]);

  React.useLayoutEffect(() => {
    setGeometryAttribute(geometry, "position", primitive.positions, 3);

    if (primitive.colors?.length) {
      setGeometryAttribute(geometry, "color", primitive.colors, 3);
    } else {
      clearGeometryAttribute(geometry, "color");
    }

    geometry.computeBoundingSphere();
  }, [geometry, primitive.colors, primitive.positions]);

  React.useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  const element =
    primitive.kind === "line-strip" ? (
      <line geometry={geometry} {...hoverHandlers}>
        <lineBasicMaterial
          color={primitive.solidColor ?? "#ffcf5a"}
          opacity={isHovered ? 1 : 0.88}
          transparent
          vertexColors={Boolean(primitive.colors?.length)}
        />
      </line>
    ) : (
      <lineSegments geometry={geometry} {...hoverHandlers}>
        <lineBasicMaterial
          color={primitive.solidColor ?? "#ffcf5a"}
          opacity={isHovered ? 1 : 0.88}
          transparent
          vertexColors={Boolean(primitive.colors?.length)}
        />
      </lineSegments>
    );

  return element;
}

function InstancePrimitive({
  hoverHandlers,
  isHovered,
  primitive,
}: {
  hoverHandlers?: PrimitiveHoverHandlers;
  isHovered: boolean;
  primitive: Scene3dInstancePrimitive;
}) {
  const meshRef = React.useRef<THREE.InstancedMesh>(null);
  const tempObject = React.useMemo(() => new THREE.Object3D(), []);
  const instanceCount = primitive.positions.length / 3;

  React.useLayoutEffect(() => {
    if (!meshRef.current) {
      return;
    }

    const mesh = meshRef.current;
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    for (let index = 0; index < instanceCount; index += 1) {
      const positionOffset = index * 3;
      const rotationOffset = index * 4;
      position.set(
        primitive.positions[positionOffset],
        primitive.positions[positionOffset + 1],
        primitive.positions[positionOffset + 2]
      );
      scale.set(
        primitive.scales[positionOffset],
        primitive.scales[positionOffset + 1],
        primitive.scales[positionOffset + 2]
      );
      if (primitive.rotations?.length) {
        rotation.set(
          primitive.rotations[rotationOffset],
          primitive.rotations[rotationOffset + 1],
          primitive.rotations[rotationOffset + 2],
          primitive.rotations[rotationOffset + 3]
        );
      } else {
        rotation.identity();
      }

      tempObject.position.copy(position);
      tempObject.quaternion.copy(rotation);
      tempObject.scale.copy(scale);
      tempObject.updateMatrix();
      mesh.setMatrixAt(index, tempObject.matrix);

      if (primitive.colors?.length) {
        mesh.setColorAt(
          index,
          new THREE.Color(
            primitive.colors[positionOffset],
            primitive.colors[positionOffset + 1],
            primitive.colors[positionOffset + 2]
          )
        );
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [
    instanceCount,
    primitive.colors,
    primitive.positions,
    primitive.rotations,
    primitive.scales,
    tempObject,
  ]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, instanceCount]}
      {...hoverHandlers}
    >
      {primitive.kind === "sphere-list" ? (
        <sphereGeometry args={[0.5, 14, 14]} />
      ) : (
        <boxGeometry args={[1, 1, 1]} />
      )}
      <meshStandardMaterial
        color={primitive.solidColor ?? "#f58fb0"}
        emissive={primitive.solidColor ?? "#f58fb0"}
        emissiveIntensity={isHovered ? 0.18 : 0}
        opacity={isHovered ? 1 : 0.92}
        transparent
        vertexColors={Boolean(primitive.colors?.length)}
      />
    </instancedMesh>
  );
}

function ScenePrimitive({
  colorMode,
  frameBounds,
  hoveredPrimitiveId,
  onHoverChange,
  primitive,
  solidColor,
}: {
  colorMode: NonNullable<Points3dViewProps["colorMode"]>;
  frameBounds: Scene3dFrame["bounds"];
  hoveredPrimitiveId: string | null;
  onHoverChange: (primitiveId: string | null) => void;
  primitive: Scene3dPrimitive;
  solidColor: string;
}) {
  const hoverHandlers = primitive.semantic
    ? {
        onPointerOver: (event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          onHoverChange(primitive.id);
        },
        onPointerOut: (event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          onHoverChange(null);
        },
      }
    : undefined;
  const isHovered = hoveredPrimitiveId === primitive.id;

  if (primitive.kind === "points") {
    return (
      <PointsPrimitive
        colorMode={colorMode}
        frameBounds={frameBounds}
        hoverHandlers={hoverHandlers}
        isHovered={isHovered}
        primitive={primitive}
        solidColor={solidColor}
      />
    );
  }

  if (primitive.kind === "line-list" || primitive.kind === "line-strip") {
    return (
      <LinePrimitive
        hoverHandlers={hoverHandlers}
        isHovered={isHovered}
        primitive={primitive}
      />
    );
  }

  return (
    <InstancePrimitive
      hoverHandlers={hoverHandlers}
      isHovered={isHovered}
      primitive={primitive}
    />
  );
}

/** Pure visual 3D scene surface for render-ready 3D frames. */
export function Points3dView({
  backgroundColor = "#10151d",
  colorMode = "intensity",
  frame,
  followPose = null,
  preserveViewOnFrameChange = true,
  resetViewToken,
  showGrid = true,
  solidColor = "#6ac7ff",
  upAxis = "z",
}: Points3dViewProps) {
  const [hoveredPrimitiveId, setHoveredPrimitiveId] = React.useState<
    string | null
  >(null);

  React.useEffect(() => {
    setHoveredPrimitiveId(null);
  }, [frame?.id]);

  const hoveredPrimitive = React.useMemo(() => {
    return (
      frame?.primitives.find((primitive) => {
        return primitive.id === hoveredPrimitiveId && primitive.semantic;
      }) ?? null
    );
  }, [frame, hoveredPrimitiveId]);

  React.useEffect(() => {
    if (!hoveredPrimitiveId || hoveredPrimitive) {
      return;
    }

    setHoveredPrimitiveId(null);
  }, [hoveredPrimitive, hoveredPrimitiveId]);

  if (!frame || !frame.primitives.length) {
    return null;
  }

  return (
    <div data-testid="points3d-view" style={VIEWPORT_STYLES}>
      <WebGpuCanvas
        camera={{ fov: 50, near: 0.01, far: 1000 }}
        frameloop="demand"
        style={CANVAS_STYLES}
      >
        <color attach="background" args={[backgroundColor]} />
        <ambientLight intensity={0.55} />
        <directionalLight intensity={0.85} position={[4, -6, 8]} />
        {showGrid ? (
          <SceneGrid
            anchorToken={resetViewToken}
            bounds={frame.bounds}
            upAxis={upAxis}
          />
        ) : null}
        <SceneViewportGizmo />
        <Points3dCameraController
          bounds={frame.bounds}
          followPose={followPose}
          preserveViewOnFrameChange={preserveViewOnFrameChange}
          resetViewToken={resetViewToken}
          upAxis={upAxis}
        />
        {hoveredPrimitive ? (
          <SceneAnnotationTooltip primitive={hoveredPrimitive} />
        ) : null}
        {frame.primitives.map((primitive) => (
          <ScenePrimitive
            key={primitive.id}
            colorMode={colorMode}
            frameBounds={frame.bounds}
            hoveredPrimitiveId={hoveredPrimitiveId}
            onHoverChange={setHoveredPrimitiveId}
            primitive={primitive}
            solidColor={solidColor}
          />
        ))}
      </WebGpuCanvas>
    </div>
  );
}
