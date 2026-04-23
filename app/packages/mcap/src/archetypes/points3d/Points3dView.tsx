import {
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
} from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import React from "react";
import * as THREE from "three";
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

type ControlsHandle = {
  target: THREE.Vector3;
  update: () => void;
};

type FollowPoseSnapshot = NonNullable<Points3dViewProps["followPose"]>;

const GRID_CELL_SIZE = 1;
const GRID_CELL_COLOR = "#314252";
const GRID_SECTION_COLOR = "#6f8aa5";
const GRID_CELL_TARGET_DIVISOR = 20;
const GRID_SECTION_MULTIPLIER = 10;
const GRID_FADE_MULTIPLIER = 12;
const GRID_MIN_FADE_DISTANCE = 80;
const GRID_MIN_SIZE = 16;
const GIZMO_MARGIN = [52, 50] as const;

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
    const defaultOffset = new THREE.Vector3(-6, -6, 4);
    const previousTarget = controlsRef.current.target.clone();
    const currentOffset = camera.position.clone().sub(previousTarget);
    let nextOffset = currentOffset.lengthSq()
      ? currentOffset
      : defaultOffset.clone();
    const previousFollowPose = lastFollowPoseRef.current;

    if (followPose.orientation) {
      const currentOrientation = new THREE.Quaternion(
        ...followPose.orientation
      );
      const localOffset =
        previousFollowPose?.orientation && currentOffset.lengthSq()
          ? currentOffset.applyQuaternion(
              new THREE.Quaternion(...previousFollowPose.orientation).invert()
            )
          : defaultOffset.clone();
      nextOffset = localOffset.applyQuaternion(currentOrientation);
    }

    camera.up.copy(upVector);
    camera.position.copy(target.clone().add(nextOffset));
    controlsRef.current.target.copy(target);
    controlsRef.current.update();
    lastFollowPoseRef.current = followPose;
    invalidate();
  }, [camera, followPose, invalidate, upVector]);

  return <OrbitControls makeDefault ref={controlsRef as never} />;
}

function PointsPrimitive({
  colorMode,
  frameBounds,
  primitive,
  solidColor,
}: {
  colorMode: NonNullable<Points3dViewProps["colorMode"]>;
  frameBounds: Scene3dFrame["bounds"];
  primitive: Scene3dPointsPrimitive;
  solidColor: string;
}) {
  const geometry = React.useMemo(() => {
    const nextGeometry = new THREE.BufferGeometry();
    nextGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(primitive.positions, 3)
    );

    if (colorMode === "intensity" && primitive.intensity?.length) {
      nextGeometry.setAttribute(
        "color",
        new THREE.BufferAttribute(
          createIntensityColorBuffer(primitive.intensity),
          3
        )
      );
    }

    if (colorMode !== "intensity" && primitive.colors?.length) {
      nextGeometry.setAttribute(
        "color",
        new THREE.BufferAttribute(primitive.colors, 3)
      );
    }

    nextGeometry.computeBoundingSphere();
    return nextGeometry;
  }, [
    colorMode,
    primitive.colors,
    primitive.id,
    primitive.intensity,
    primitive.positions,
  ]);

  React.useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  return (
    <points geometry={geometry}>
      <pointsMaterial
        color={primitive.solidColor ?? solidColor}
        opacity={1}
        size={primitive.pointSize ?? computePointSize(frameBounds)}
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

function LinePrimitive({ primitive }: { primitive: Scene3dLinePrimitive }) {
  const geometry = React.useMemo(() => {
    const nextGeometry = new THREE.BufferGeometry();
    nextGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(primitive.positions, 3)
    );

    if (primitive.colors?.length) {
      nextGeometry.setAttribute(
        "color",
        new THREE.BufferAttribute(primitive.colors, 3)
      );
    }

    nextGeometry.computeBoundingSphere();
    return nextGeometry;
  }, [primitive.colors, primitive.id, primitive.positions]);

  React.useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  const element =
    primitive.kind === "line-strip" ? (
      <line geometry={geometry}>
        <lineBasicMaterial
          color={primitive.solidColor ?? "#ffcf5a"}
          vertexColors={Boolean(primitive.colors?.length)}
        />
      </line>
    ) : (
      <lineSegments geometry={geometry}>
        <lineBasicMaterial
          color={primitive.solidColor ?? "#ffcf5a"}
          vertexColors={Boolean(primitive.colors?.length)}
        />
      </lineSegments>
    );

  return element;
}

function InstancePrimitive({
  primitive,
}: {
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
    <instancedMesh ref={meshRef} args={[undefined, undefined, instanceCount]}>
      {primitive.kind === "sphere-list" ? (
        <sphereGeometry args={[0.5, 14, 14]} />
      ) : (
        <boxGeometry args={[1, 1, 1]} />
      )}
      <meshStandardMaterial
        color={primitive.solidColor ?? "#f58fb0"}
        transparent
        vertexColors={Boolean(primitive.colors?.length)}
      />
    </instancedMesh>
  );
}

function ScenePrimitive({
  colorMode,
  frameBounds,
  primitive,
  solidColor,
}: {
  colorMode: NonNullable<Points3dViewProps["colorMode"]>;
  frameBounds: Scene3dFrame["bounds"];
  primitive: Scene3dPrimitive;
  solidColor: string;
}) {
  if (primitive.kind === "points") {
    return (
      <PointsPrimitive
        colorMode={colorMode}
        frameBounds={frameBounds}
        primitive={primitive}
        solidColor={solidColor}
      />
    );
  }

  if (primitive.kind === "line-list" || primitive.kind === "line-strip") {
    return <LinePrimitive primitive={primitive} />;
  }

  return <InstancePrimitive primitive={primitive} />;
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
  if (!frame || !frame.primitives.length) {
    return null;
  }

  return (
    <div data-testid="points3d-view" style={VIEWPORT_STYLES}>
      <Canvas
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
        {frame.primitives.map((primitive) => (
          <ScenePrimitive
            key={primitive.id}
            colorMode={colorMode}
            frameBounds={frame.bounds}
            primitive={primitive}
            solidColor={solidColor}
          />
        ))}
      </Canvas>
    </div>
  );
}
