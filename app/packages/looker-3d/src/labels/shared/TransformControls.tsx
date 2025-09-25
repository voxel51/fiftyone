import { TransformControls } from "@react-three/drei";
import { useRef } from "react";
import * as THREE from "three";
import type { TransformProps } from "./types";

interface TransformControlsWrapperProps extends TransformProps {
  children: React.ReactNode;
  transformControlsPosition?: THREE.Vector3Tuple;
}

/**
 * Shared component for rendering transform controls.
 */
export const TransformControlsWrapper = ({
  children,
  isSelectedForTransform,
  isAnnotateMode,
  transformMode = "translate",
  transformSpace = "world",
  onTransformStart,
  onTransformEnd,
  onTransformChange,
  transformControlsRef,
  transformControlsPosition = [0, 0, 0],
}: TransformControlsWrapperProps) => {
  const groupRef = useRef<any>(null);

  return (
    <>
      <group ref={groupRef}>{children}</group>

      {/* TransformControls for annotate mode */}
      {isAnnotateMode && isSelectedForTransform && (
        <group position={transformControlsPosition}>
          <TransformControls
            ref={transformControlsRef}
            object={groupRef}
            mode={transformMode}
            space={transformSpace}
            onMouseDown={onTransformStart}
            onMouseUp={onTransformEnd}
            onObjectChange={onTransformChange}
          />
        </group>
      )}
    </>
  );
};
