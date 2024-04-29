import { getSampleSrc } from "@fiftyone/state";
import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import { AnimationMixer, Mesh, Quaternion, Vector3 } from "three";
import { GltfAsset } from "../../hooks";
import { useAnimationSelect } from "../../hooks/use-animation-select";
import { useMeshMaterialControls } from "../../hooks/use-mesh-material-controls";
import { usePercolateMaterial } from "../../hooks/use-set-scene-transparency";
import { useFo3dContext } from "../context";
import { getBasePathForTextures, getResolvedUrlForFo3dAsset } from "../utils";

export const Gltf = ({
  name,
  gltf: { gltfPath, defaultMaterial },
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

  const gltfUrl = useMemo(
    () => getSampleSrc(getResolvedUrlForFo3dAsset(gltfPath, fo3dRoot)),
    [gltfPath, fo3dRoot]
  );

  const resourcePath = useMemo(
    () => getBasePathForTextures(gltfUrl, ["glb", "gltf"]),
    [gltfUrl]
  );

  const { material } = useMeshMaterialControls(name, defaultMaterial, true);

  const { scene, animations } = useGLTF(gltfUrl, true, undefined, (loader) => {
    loader.setResourcePath(resourcePath);
  });

  usePercolateMaterial(scene, material);

  useEffect(() => {
    scene.traverse((node) => {
      if (node instanceof Mesh && node.material) {
        if (!node.userData.foOriginalMaterialConfig) {
          node.userData.foOriginalMaterialConfig = {
            transparent: node.material.transparent,
            depthWrite: node.material.depthWrite,
            alphaTest: node.material.alphaTest,
          };
        }

        if (material.opacity < 1) {
          // set all materials to transparent so we can control opacity
          node.material.transparent = true;
          node.material.depthWrite = false;
          node.material.alphaTest = Number.EPSILON;
        } else {
          node.material.transparent =
            node.userData.foOriginalMaterialConfig.transparent;
          node.material.depthWrite =
            node.userData.foOriginalMaterialConfig.depthWrite;
          node.material.alphaTest =
            node.userData.foOriginalMaterialConfig.alphaTest;
        }

        node.material.opacity = material.opacity;
        node.material.wireframe = material["wireframe"] ?? false;
      }
    });
  }, [scene, material]);

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
