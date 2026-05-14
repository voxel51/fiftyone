/* eslint-disable react/no-unknown-property */
import { GizmoHelper } from "@react-three/drei/core/GizmoHelper";
import { GizmoViewport } from "@react-three/drei/core/GizmoViewport";
import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import type { ReactNode } from "react";

export interface Base3DSceneProps {
  readonly children?: ReactNode;
}

/**
 * Base 3D R3F scene with reusable navigation, axes, grid, and gizmo affordances.
 */
export function Base3DScene({ children }: Base3DSceneProps) {
  return (
    <>
      <color args={["#050b12"]} attach="background" />
      <ambientLight intensity={0.8} />
      {children}
      <OrbitControls enableDamping={false} makeDefault />
      <GizmoHelper alignment="top-right" margin={[72, 72]} renderPriority={1}>
        <GizmoViewport
          axisColors={["#ef4444", "#22c55e", "#3b82f6"]}
          labelColor="#f8fafc"
        />
      </GizmoHelper>
    </>
  );
}
