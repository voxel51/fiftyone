import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Vector3 } from "three";

interface HoveredPointMarkerProps {
  position: Vector3;
}

export const HoveredPointMarker = ({ position }: HoveredPointMarkerProps) => {
  const meshRef = useRef<any>(null);

  // apply pulsating effect for scaling (based on distance from camera) and color
  // so that the marker is visible from far away
  useFrame(({ clock, camera }) => {
    const t = clock.getElapsedTime();
    const distance = camera.position.distanceTo(position);
    const pulse = 0.5 + 0.3 * Math.sin(t * 4);
    const scale = pulse * (distance * 0.1);

    if (meshRef.current) {
      meshRef.current.scale.set(scale, scale, scale);
      const colorPhase = (Math.sin(t * 2) + 1) / 2;
      meshRef.current.material.color.setRGB(1, colorPhase, 0);
      meshRef.current.material.emissive.setRGB(1, colorPhase, 0);
      meshRef.current.material.emissiveIntensity = 0.7 + 0.3 * colorPhase;
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[0.07, 32, 32]} />
      <meshStandardMaterial
        color="red"
        emissive="orange"
        emissiveIntensity={1}
      />
    </mesh>
  );
};
