import { Grid, OrbitControls } from "@react-three/drei";
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

const GRID_CELL_SIZE = 1;
const GRID_SECTION_SIZE = 10;
const GRID_FADE_DISTANCE = 240;
const GRID_CELL_COLOR = "#314252";
const GRID_SECTION_COLOR = "#6f8aa5";

function getAxisIndex(upAxis: NonNullable<Points3dViewProps["upAxis"]>) {
  if (upAxis === "x") {
    return 0;
  }

  if (upAxis === "z") {
    return 2;
  }

  return 1;
}

function getSnappedGridLevel(value: number) {
  return Math.floor(value / GRID_SECTION_SIZE) * GRID_SECTION_SIZE;
}

function getGridRotation(upAxis: NonNullable<Points3dViewProps["upAxis"]>) {
  if (upAxis === "x") {
    return [0, 0, Math.PI / 2] as const;
  }

  if (upAxis === "z") {
    return [Math.PI / 2, 0, 0] as const;
  }

  return [0, 0, 0] as const;
}

function SceneGrid({
  bounds,
  followPose,
  upAxis,
}: {
  bounds: Points3dBounds;
  followPose: Points3dViewProps["followPose"];
  upAxis: NonNullable<Points3dViewProps["upAxis"]>;
}) {
  const position = React.useMemo(() => {
    const axisIndex = getAxisIndex(upAxis);
    const anchorLevel = followPose
      ? followPose.position[axisIndex]
      : bounds.min[axisIndex];
    const snappedLevel = getSnappedGridLevel(anchorLevel);

    if (upAxis === "x") {
      return [snappedLevel, 0, 0] as const;
    }

    if (upAxis === "z") {
      return [0, 0, snappedLevel] as const;
    }

    return [0, snappedLevel, 0] as const;
  }, [bounds.min, followPose, upAxis]);

  const rotation = React.useMemo(() => getGridRotation(upAxis), [upAxis]);

  return (
    <Grid
      cellColor={GRID_CELL_COLOR}
      cellSize={GRID_CELL_SIZE}
      fadeDistance={GRID_FADE_DISTANCE}
      fadeStrength={1}
      followCamera
      infiniteGrid
      position={position}
      rotation={rotation}
      sectionColor={GRID_SECTION_COLOR}
      sectionSize={GRID_SECTION_SIZE}
    />
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
  upAxis: NonNullable<Points3dViewProps["upAxis"]>;
}) {
  const { camera, invalidate } = useThree();
  const controlsRef = React.useRef<ControlsHandle | null>(null);
  const lastFrameKeyRef = React.useRef<string | null>(null);
  const lastResetTokenRef =
    React.useRef<Points3dViewProps["resetViewToken"]>(undefined);

  const frameKey = React.useMemo(() => {
    return `${bounds.min.join(",")}:${bounds.max.join(",")}`;
  }, [bounds]);

  React.useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera) || !frameKey) {
      return;
    }

    const shouldReset =
      lastFrameKeyRef.current === null ||
      resetViewToken !== lastResetTokenRef.current ||
      (!preserveViewOnFrameChange && lastFrameKeyRef.current !== frameKey);

    if (!shouldReset) {
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
  ]);

  React.useEffect(() => {
    if (
      !(camera instanceof THREE.PerspectiveCamera) ||
      !controlsRef.current ||
      !followPose
    ) {
      return;
    }

    const target = new THREE.Vector3(...followPose.position);
    const upVector =
      upAxis === "x"
        ? new THREE.Vector3(1, 0, 0)
        : upAxis === "y"
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1);
    const defaultOffset = new THREE.Vector3(-6, -6, 4);
    if (followPose.orientation) {
      defaultOffset.applyQuaternion(
        new THREE.Quaternion(...followPose.orientation)
      );
    }

    camera.up.copy(upVector);
    camera.position.copy(target.clone().add(defaultOffset));
    controlsRef.current.target.copy(target);
    controlsRef.current.update();
    invalidate();
  }, [camera, followPose, invalidate, upAxis]);

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
            bounds={frame.bounds}
            followPose={followPose}
            upAxis={upAxis}
          />
        ) : null}
        <axesHelper args={[1.5]} />
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
