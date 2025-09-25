import { TransformControls } from "@react-three/drei";
import { useRef } from "react";
import type { TransformProps } from "./types";

interface TransformControlsWrapperProps extends TransformProps {
  children: React.ReactNode;
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
}: TransformControlsWrapperProps) => {
  const groupRef = useRef<any>(null);

  return (
    <>
      <group ref={groupRef}>{children}</group>

      {/* TransformControls for annotate mode */}
      {isAnnotateMode && isSelectedForTransform && (
        <TransformControls
          ref={transformControlsRef}
          object={groupRef}
          mode={transformMode}
          space={transformSpace}
          onMouseDown={onTransformStart}
          onMouseUp={onTransformEnd}
          onObjectChange={onTransformChange}
        />
      )}
    </>
  );
};
