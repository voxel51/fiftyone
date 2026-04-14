import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import React from "react";
import * as THREE from "three";
import {
  computePointSize,
  createIntensityColorBuffer,
  fitPerspectiveCameraToBounds,
} from "./helpers";
import type { Points3dBounds, Points3dFrame, Points3dViewProps } from "./types";

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

function Points3dCameraController({
  bounds,
  preserveViewOnFrameChange,
  resetViewToken,
}: {
  bounds: Points3dBounds;
  preserveViewOnFrameChange: boolean;
  resetViewToken: Points3dViewProps["resetViewToken"];
}) {
  const { camera, invalidate } = useThree();
  const controlsRef = React.useRef<ControlsHandle | null>(null);
  const lastFrameKeyRef = React.useRef<string | null>(null);
  const lastResetTokenRef =
    React.useRef<Points3dViewProps["resetViewToken"]>(undefined);

  const frameKey = React.useMemo(() => {
    if (!bounds) {
      return null;
    }

    return `${bounds.min.join(",")}:${bounds.max.join(",")}`;
  }, [bounds]);

  React.useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera) || !bounds || !frameKey) {
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

  return <OrbitControls makeDefault ref={controlsRef as never} />;
}

function PointsCloud({
  colorMode,
  frame,
  solidColor,
}: Required<Pick<Points3dViewProps, "colorMode" | "solidColor">> & {
  frame: Points3dFrame;
}) {
  const geometry = React.useMemo(() => {
    const nextGeometry = new THREE.BufferGeometry();
    nextGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(frame.positions, 3)
    );

    if (colorMode === "intensity" && frame.intensity?.length) {
      nextGeometry.setAttribute(
        "color",
        new THREE.BufferAttribute(
          createIntensityColorBuffer(frame.intensity),
          3
        )
      );
    }

    nextGeometry.computeBoundingSphere();
    return nextGeometry;
  }, [colorMode, frame.id, frame.intensity, frame.positions]);

  React.useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  const pointSize = React.useMemo(() => {
    return computePointSize(frame.bounds);
  }, [frame.bounds]);

  return (
    <points data-testid="points3d-view-points" geometry={geometry}>
      <pointsMaterial
        color={solidColor}
        size={pointSize}
        sizeAttenuation
        transparent
        opacity={1}
        vertexColors={
          colorMode === "intensity" && Boolean(frame.intensity?.length)
        }
      />
    </points>
  );
}

/** Pure visual 3D point surface for render-ready point frames. */
export function Points3dView({
  colorMode = "intensity",
  frame,
  preserveViewOnFrameChange = true,
  resetViewToken,
  solidColor = "#6ac7ff",
}: Points3dViewProps) {
  if (!frame || frame.pointCount <= 0) {
    return null;
  }

  return (
    <div data-testid="points3d-view" style={VIEWPORT_STYLES}>
      <Canvas
        camera={{ fov: 50, near: 0.01, far: 1000 }}
        frameloop="demand"
        style={CANVAS_STYLES}
      >
        <color attach="background" args={["#10151d"]} />
        <ambientLight intensity={0.55} />
        <directionalLight intensity={0.85} position={[4, -6, 8]} />
        <gridHelper args={[10, 10, "#2b3948", "#1c2733"]} />
        <axesHelper args={[1.5]} />
        <Points3dCameraController
          bounds={frame.bounds}
          preserveViewOnFrameChange={preserveViewOnFrameChange}
          resetViewToken={resetViewToken}
        />
        <PointsCloud
          colorMode={colorMode}
          frame={frame}
          solidColor={solidColor}
        />
      </Canvas>
    </div>
  );
}
