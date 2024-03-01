import { MeshWobbleMaterial } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Color, Mesh } from "three";

/**
 * This spinning cube is to be used as a loading indicator.
 */
export const SpinningCube = () => {
  const meshRef = useRef<Mesh>();

  useFrame(() => {
    // this rotates the loading cube
    meshRef.current.rotation.x = meshRef.current.rotation.y +=
      Math.random() / 30;
    meshRef.current.rotation.y = meshRef.current.rotation.y += 0.007;
  });

  return (
    <group>
      <directionalLight position={[100, 100, 10]} />
      <ambientLight intensity={0.5} />

      <mesh ref={meshRef}>
        <boxGeometry args={[0.1, 0.1, 0.1]} />
        <MeshWobbleMaterial
          attach="material"
          color={new Color("#fe6d05")}
          speed={2}
          factor={0.6}
        />
      </mesh>
    </group>
  );
};
