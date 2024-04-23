import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import { AnimationMixer, Material, Mesh, Quaternion, Vector3 } from "three";
import { GltfAsset } from "../../hooks";
import { useAnimationSelect } from "../../hooks/use-animation-select";
import { useMeshMaterialControls } from "../../hooks/use-mesh-material-controls";
import { getBasePathForTextures } from "../utils";
import { invalidate } from "@react-three/fiber";

export const Gltf = ({
  name,
  gltf: { gltfUrl, defaultMaterial },
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
  const resourcePath = useMemo(
    () => getBasePathForTextures(gltfUrl, ["glb", "gltf"]),
    [gltfUrl]
  );

  const { material } = useMeshMaterialControls(name, defaultMaterial, true);

  const { scene, animations } = useGLTF(gltfUrl, true, undefined, (loader) => {
    loader.setResourcePath(resourcePath);
  });

  useEffect(() => {
    const setMtl = (mtl: Material) => {
      mtl.opacity = material.opacity;
      if (material.opacity < 1) {
        mtl["transparent"] = material.opacity < 1;
        mtl["depthWrite"] = false;
      }
      mtl["wireframe"] = material["wireframe"] ?? false;
    };

    scene.traverse((node: Mesh) => {
      if (node instanceof Mesh || (node as Mesh).material) {
        if (Array.isArray(node.material)) {
          for (const mtl of node.material) {
            setMtl(mtl);
          }
        } else {
          setMtl(node.material);
        }
      }
    });
    // todo: investigate not triggering rerender as we expect
    invalidate();
  }, [scene, material]);

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
      >
        {children ?? null}
      </primitive>
    );
  }

  return null;
};
