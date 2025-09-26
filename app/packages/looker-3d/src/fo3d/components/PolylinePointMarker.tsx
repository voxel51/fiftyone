import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Vector3 } from "three";

interface PolylinePointMarkerProps {
  position: Vector3;
  color?: string;
  size?: number;
  pulsate?: boolean;
}

export const PolylinePointMarker = ({
  position,
  color = "#ffffff",
  size = 0.05,
  pulsate = true,
}: PolylinePointMarkerProps) => {
  const meshRef = useRef<any>(null);

  // Apply subtle pulsating effect for visibility (if enabled)
  useFrame(({ clock, camera }) => {
    const distance = camera.position.distanceTo(position);

    if (pulsate) {
      const t = clock.getElapsedTime();
      const pulse = 0.8 + 0.2 * Math.sin(t * 3);
      const scale = pulse * (distance * 0.08);

      if (meshRef.current) {
        meshRef.current.scale.set(scale, scale, scale);
      }
    } else {
      // Static scale based on distance only
      const scale = distance * 0.08;

      if (meshRef.current) {
        meshRef.current.scale.set(scale, scale, scale);
      }
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[size, 16, 16]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.3}
      />
    </mesh>
  );
};
