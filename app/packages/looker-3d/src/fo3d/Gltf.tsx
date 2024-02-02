import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AnimationMixer, Quaternion, Vector3 } from "three";
import { GltfAsset } from "../hooks";

export const Gltf = ({
  gltf: { gltfUrl },
  position,
  quaternion,
  scale,
}: {
  gltf: GltfAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
}) => {
  const { scene, animations } = useGLTF(gltfUrl, true);
  const groupRef = useRef();

  let mixer = useMemo(() => new AnimationMixer(scene), [scene]);

  useEffect(() => {
    animations.forEach((clip) => {
      const action = mixer.clipAction(clip);
      action.play();
    });
  }, [animations, mixer]);

  useFrame((state, delta) => {
    mixer.update(delta);
  });

  if (scene) {
    return (
      <primitive
        ref={groupRef}
        object={scene}
        position={position}
        quaternion={quaternion}
        scale={scale}
        dispose={null}
      />
    );
  }

  return null;
};
