import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

interface HoveredPointMarkerProps {
  position: THREE.Vector3;
}

// Scale factor - adjusts how much the marker grows with distance
const DISTANCE_SCALE_FACTOR = 0.005;

const MIN_SCALE = 0.01;
const MAX_SCALE = 2;

export const HoveredPointMarker = ({ position }: HoveredPointMarkerProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();

  useFrame(() => {
    if (!meshRef.current) return;

    const distance = camera.position.distanceTo(position);

    let scale: number;
    if (camera.type === "OrthographicCamera") {
      // For orthographic camera, use inverse zoom
      const orthoCamera = camera as THREE.OrthographicCamera;
      scale = Math.max(MIN_SCALE, 1 / orthoCamera.zoom);
    } else {
      // For perspective camera, scale with distance
      scale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, distance * DISTANCE_SCALE_FACTOR)
      );
    }

    meshRef.current.scale.setScalar(scale);
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[1, 16, 16]} />
      <meshBasicMaterial
        color="red"
        transparent
        opacity={0.6}
        depthTest={false}
      />
    </mesh>
  );
};
