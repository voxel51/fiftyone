import { getSampleSrc, isInMultiPanelViewAtom } from "@fiftyone/state";
import { useGLTF } from "@react-three/drei";
import { useMemo, useRef } from "react";
import { useRecoilValue } from "recoil";
import { AnimationMixer, type Quaternion, type Vector3 } from "three";
import { SkeletonUtils } from "three-stdlib";
import type { GltfAsset } from "../../hooks";
import { useAnimationSelect } from "../../hooks/use-animation-select";
import { useMeshMaterialControls } from "../../hooks/use-mesh-material-controls";
import { usePercolateMaterial } from "../../hooks/use-set-scene-transparency";
import { useFo3dContext } from "../context";
import { getBasePathForTextures, getResolvedUrlForFo3dAsset } from "../utils";

export const Gltf = ({
  name,
  gltf: { gltfPath, preTransformedGltfPath, defaultMaterial },
  position,
  quaternion,
  scale,
  children,
}: {
  name: string;
  gltf: GltfAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
  children: React.ReactNode;
}) => {
  const { fo3dRoot } = useFo3dContext();
  const isInMultiPanelView = useRecoilValue(isInMultiPanelViewAtom);

  const gltfUrl = useMemo(
    () =>
      preTransformedGltfPath ??
      getSampleSrc(getResolvedUrlForFo3dAsset(gltfPath, fo3dRoot)),
    [gltfPath, preTransformedGltfPath, fo3dRoot]
  );

  const resourcePath = useMemo(
    () => getBasePathForTextures(fo3dRoot, gltfUrl),
    [fo3dRoot, gltfUrl]
  );

  const { material } = useMeshMaterialControls(name, defaultMaterial, true);

  const { scene: scene_, animations } = useGLTF(
    gltfUrl,
    true,
    undefined,
    (loader) => {
      loader.setResourcePath(resourcePath);
    }
  );

  // Deep clone scene when in multipanel view to avoid React Three Fiber caching issues
  // todo: optimize this with instanced mesh
  const scene = useMemo(() => {
    if (isInMultiPanelView && scene_) {
      // Use SkeletonUtils otherwise skeletons might de-bind
      return SkeletonUtils.clone(scene_);
    }
    return scene_;
  }, [scene_, isInMultiPanelView]);

  usePercolateMaterial(scene, material);

  const groupRef = useRef();

  const mixer = useMemo(() => new AnimationMixer(scene), [scene]);

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
      >
        {children ?? null}
      </primitive>
    );
  }

  return null;
};
