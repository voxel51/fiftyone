import { ThreeEvent } from "@react-three/fiber";
import { forwardRef } from "react";
import { Mesh, Vector3 } from "three";
import { LABEL_3D_ANNOTATION_POINT_SELECTED_FOR_TRANSFORMATION_COLOR } from "../constants";

interface SphericalMarkerProps {
  position: Vector3 | [number, number, number];
  color?: string;
  size?: number;
  opacity?: number;
  isSelected?: boolean;
  onPointerOver?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (event: ThreeEvent<PointerEvent>) => void;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
}

export const SphericalMarker = forwardRef<Mesh, SphericalMarkerProps>(
  (
    {
      position,
      color = "#ffffff",
      size = 0.05,
      opacity = 1,
      isSelected = false,
      onPointerOver,
      onPointerOut,
      onClick,
    },
    ref
  ) => {
    const effectiveColor = isSelected
      ? LABEL_3D_ANNOTATION_POINT_SELECTED_FOR_TRANSFORMATION_COLOR
      : color;

    return (
      <mesh
        ref={ref}
        position={position}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onClick={onClick}
      >
        <sphereGeometry args={[size, 10, 10]} />
        <meshStandardMaterial
          color={effectiveColor}
          opacity={opacity}
          emissive={effectiveColor}
          emissiveIntensity={isSelected ? 1 : 0.3}
        />
      </mesh>
    );
  }
);
