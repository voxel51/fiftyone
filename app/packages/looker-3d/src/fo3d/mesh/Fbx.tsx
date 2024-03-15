import { useFBX } from "@react-three/drei";
import { useMemo } from "react";
import { AnimationMixer, Quaternion, Vector3 } from "three";
import { FbxAsset } from "../../hooks";
import { useAnimationSelect } from "../../hooks/use-animation-select";

export const Fbx = ({
  name,
  fbx: { fbxUrl },
  position,
  quaternion,
  scale,
  children,
}: {
  name: string;
  fbx: FbxAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
  children: React.ReactNode;
}) => {
  const fbx = useFBX(fbxUrl);

  const animationClips = useMemo(() => {
    return fbx?.animations || [];
  }, [fbx]);

  const mixer = useMemo(() => new AnimationMixer(fbx), [fbx]);

  useAnimationSelect(name, animationClips, mixer);

  if (fbx) {
    return (
      <primitive
        object={fbx}
        position={position}
        quaternion={quaternion}
        scale={scale}
      >
        {children ?? null}
      </primitive>
    );
  }

  return null;
};
