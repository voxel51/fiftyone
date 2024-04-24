import { useEffect } from "react";
import { Material, Mesh, Object3D } from "three";
import { useMeshMaterialControls } from "./use-mesh-material-controls";

const setOpacity = (
  mtl: Material,
  newMaterial: ReturnType<typeof useMeshMaterialControls>["material"],
  userData: Record<string, any>
) => {
  if (!userData.foOriginalMaterialConfig) {
    userData.foOriginalMaterialConfig = {
      transparent: mtl.transparent,
      depthWrite: mtl.depthWrite,
      alphaTest: mtl.alphaTest,
    };
  }

  if (newMaterial.opacity < 1) {
    // set all materials to transparent so we can control opacity
    mtl.transparent = true;
    mtl.depthWrite = false;
    mtl.alphaTest = Number.EPSILON;
  } else {
    mtl.transparent = userData.foOriginalMaterialConfig.transparent;
    mtl.depthWrite = userData.foOriginalMaterialConfig.depthWrite;
    mtl.alphaTest = userData.foOriginalMaterialConfig.alphaTest;
  }

  mtl.opacity = newMaterial.opacity;
  if (Object.prototype.hasOwnProperty.call(mtl, "wireframe")) {
    mtl["wireframe"] = newMaterial["wireframe"] ?? false;
  }
};

/**
 * This hook traverses the scene graph and sets opacity for all materials.
 */
export const useSetSceneTransparency = (
  scene: Object3D,
  newMaterial: ReturnType<typeof useMeshMaterialControls>["material"]
) => {
  useEffect(() => {
    scene.traverse((node: Mesh) => {
      if (!node.material) {
        return;
      }

      if (Array.isArray(node.material)) {
        for (const mtl of node.material) {
          // assume all materials of a given node have same depthWrite, alphaTest, etc.
          setOpacity(mtl, newMaterial, node.userData);
        }
      } else {
        setOpacity(node.material, newMaterial, node.userData);
      }
    });
  }, [scene, newMaterial]);
};
