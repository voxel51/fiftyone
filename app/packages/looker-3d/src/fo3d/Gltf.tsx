import { useGLTF } from "@react-three/drei";
import { useMemo, useRef } from "react";
import { AnimationMixer, Quaternion, Vector3 } from "three";
import { GltfAsset } from "../hooks";
import { useAnimationSelect } from "../hooks/use-animation-select";

export const Gltf = ({
  name,
  gltf: { gltfUrl },
  position,
  quaternion,
  scale,
}: {
  name: string;
  gltf: GltfAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
}) => {
  const { scene, animations } = useGLTF(gltfUrl, true);
  const groupRef = useRef();

  let mixer = useMemo(() => new AnimationMixer(scene), [scene]);

  useAnimationSelect(name, animations, mixer);

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
