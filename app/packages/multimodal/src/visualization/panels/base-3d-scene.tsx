/* eslint-disable react/no-unknown-property */
import { GizmoHelper, GizmoViewport, OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useLayoutEffect, type ReactNode } from "react";

import { VISUALIZATION_PANEL_BACKGROUND_COLOR } from "./style-tokens";

const AXIS_COLORS: [string, string, string] = ["#ef4444", "#22c55e", "#3b82f6"];
const AXIS_LABEL_COLOR = "#f8fafc";
const DEFAULT_AMBIENT_LIGHT_INTENSITY = 0.8;
const GIZMO_MARGIN_PIXELS: [number, number] = [72, 72];
const GIZMO_RENDER_PRIORITY = 1;
const Z_UP_AXIS = { x: 0, y: 0, z: 1 } as const;

/**
 * Props for the shared 3D visualization scene shell.
 */
export interface Base3DSceneProps {
  readonly children?: ReactNode;
}

/**
 * Base 3D R3F scene with reusable navigation, axes, and Z-up coordinates.
 */
export function Base3DScene({ children }: Base3DSceneProps) {
  useZUpSceneCoordinates();

  return (
    <>
      <color
        args={[VISUALIZATION_PANEL_BACKGROUND_COLOR]}
        attach="background"
      />
      <ambientLight intensity={DEFAULT_AMBIENT_LIGHT_INTENSITY} />
      {children}
      <OrbitControls enableDamping={false} makeDefault />
      <GizmoHelper
        alignment="top-right"
        margin={GIZMO_MARGIN_PIXELS}
        renderPriority={GIZMO_RENDER_PRIORITY}
      >
        <GizmoViewport axisColors={AXIS_COLORS} labelColor={AXIS_LABEL_COLOR} />
      </GizmoHelper>
    </>
  );
}

function useZUpSceneCoordinates() {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);

  useLayoutEffect(() => {
    const previousUp = camera.up.clone();

    camera.up.set(Z_UP_AXIS.x, Z_UP_AXIS.y, Z_UP_AXIS.z);
    camera.updateProjectionMatrix();
    invalidate();

    return () => {
      camera.up.copy(previousUp);
      camera.updateProjectionMatrix();
      invalidate();
    };
  }, [camera, invalidate]);
}
