import { getSampleSrc, isInMultiPanelViewAtom } from "@fiftyone/state";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { AnimationMixer, type Quaternion, type Vector3 } from "three";
import { FBXLoader } from "three-stdlib";
import type { FbxAsset } from "../../hooks";
import { useAnimationSelect } from "../../hooks/use-animation-select";
import { useFoLoader } from "../../hooks/use-fo-loaders";
import { useMeshMaterialControls } from "../../hooks/use-mesh-material-controls";
import { usePercolateMaterial } from "../../hooks/use-set-scene-transparency";
import { useFo3dContext } from "../context";
import { getBasePathForTextures, getResolvedUrlForFo3dAsset } from "../utils";
import { SkeletonUtils } from "three-stdlib";

export const Fbx = ({
  name,
  fbx: { fbxPath, preTransformedFbxPath, defaultMaterial },
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
  const { fo3dRoot } = useFo3dContext();
  const isInMultiPanelView = useRecoilValue(isInMultiPanelViewAtom);

  const fbxUrl = useMemo(
    () =>
      preTransformedFbxPath ??
      getSampleSrc(getResolvedUrlForFo3dAsset(fbxPath, fo3dRoot)),
    [fbxPath, preTransformedFbxPath, fo3dRoot]
  );

  const resourcePath = useMemo(
    () => getBasePathForTextures(fo3dRoot, fbxUrl),
    [fo3dRoot, fbxUrl]
  );

  const { material } = useMeshMaterialControls(name, defaultMaterial, true);

  const fbx_ = useFoLoader(FBXLoader, fbxUrl, (loader) => {
    loader.setResourcePath(resourcePath);
  });

  // Deep clone mesh when in multipanel view to avoid React Three Fiber caching issues
  // todo: optimize this with instanced mesh
  const fbx = useMemo(() => {
    if (isInMultiPanelView && fbx_) {
      // Use SkeletonUtils otherwise skeletons might de-bind
      return SkeletonUtils.clone(fbx_);
    }
    return fbx_;
  }, [fbx_, isInMultiPanelView]);

  usePercolateMaterial(fbx, material);

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
