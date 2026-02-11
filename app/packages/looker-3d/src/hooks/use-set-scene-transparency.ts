import { useEffect } from "react";
import type { Material, Mesh, Object3D } from "three";
import { FO_USER_DATA } from "../constants";
import type { useMeshMaterialControls } from "./use-mesh-material-controls";

const setOpacity = (
  mtl: Material,
  newMaterial: ReturnType<typeof useMeshMaterialControls>["material"],
  userData: Record<string, any>
) => {
  if (!userData[FO_USER_DATA.FO_ORIGINAL_MATERIAL_CONFIG]) {
    userData[FO_USER_DATA.FO_ORIGINAL_MATERIAL_CONFIG] = {
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
    mtl.transparent =
      userData[FO_USER_DATA.FO_ORIGINAL_MATERIAL_CONFIG].transparent;
    mtl.depthWrite =
      userData[FO_USER_DATA.FO_ORIGINAL_MATERIAL_CONFIG].depthWrite;
    mtl.alphaTest =
      userData[FO_USER_DATA.FO_ORIGINAL_MATERIAL_CONFIG].alphaTest;
  }

  mtl.opacity = newMaterial.opacity;
  if (Object.prototype.hasOwnProperty.call(mtl, "wireframe")) {
    mtl["wireframe"] = newMaterial["wireframe"] ?? false;
  }
};

/**
 * This hook traverses the scene graph and sets opacity and wireframe for all materials.
 */
export const usePercolateMaterial = (
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
