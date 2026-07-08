import { MeshoptDecoder } from "meshoptimizer";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import type { RgbaColor } from "../../../decoders";
import { clamp01 } from "./utils";

const sceneModelLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
type SceneModelAsset = {
  readonly cacheKey: string;
  readonly data?: Uint8Array;
  readonly url: string;
};
const sceneModelLoadCache = new Map<string, Promise<THREE.Object3D>>();
const sceneModelDataAssetCache = new WeakMap<Uint8Array, SceneModelAsset>();
let nextSceneModelDataAssetId = 0;
const MODEL_Y_UP_TO_SCENE_Z_UP_QUATERNION =
  new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, -1, 0),
    ),
  );
export const MODEL_Y_UP_TO_SCENE_Z_UP_QUATERNION_COMPONENTS = [
  MODEL_Y_UP_TO_SCENE_Z_UP_QUATERNION.x,
  MODEL_Y_UP_TO_SCENE_Z_UP_QUATERNION.y,
  MODEL_Y_UP_TO_SCENE_Z_UP_QUATERNION.z,
  MODEL_Y_UP_TO_SCENE_Z_UP_QUATERNION.w,
] as [number, number, number, number];

export function modelAssetForPrimitive(model: {
  readonly data?: Uint8Array;
  readonly mediaType: string;
  readonly url: string;
}): SceneModelAsset | null {
  if (model.url) {
    return { cacheKey: `url:${model.url}`, url: model.url };
  }
  if (!model.data?.byteLength || typeof URL === "undefined") {
    return null;
  }

  const cachedAsset = sceneModelDataAssetCache.get(model.data);
  if (cachedAsset) {
    return cachedAsset;
  }

  const cacheKey = `data:${nextSceneModelDataAssetId++}`;
  const blob = new Blob([model.data], {
    type: model.mediaType || "model/gltf-binary",
  });
  const url = URL.createObjectURL(blob);
  const asset = { cacheKey, data: model.data, url };
  sceneModelDataAssetCache.set(model.data, asset);

  return asset;
}

export function loadSceneModelAsset(asset: SceneModelAsset) {
  const cached = sceneModelLoadCache.get(asset.cacheKey);
  if (cached) {
    return cached;
  }

  const loadPromise = new Promise<THREE.Object3D>((resolve, reject) => {
    sceneModelLoader.load(
      asset.url,
      (gltf) => resolve(gltf.scene),
      undefined,
      reject,
    );
  }).then(
    (object) => {
      revokeSceneModelObjectUrl(asset);
      return object;
    },
    (error) => {
      sceneModelLoadCache.delete(asset.cacheKey);
      if (asset.data) {
        sceneModelDataAssetCache.delete(asset.data);
      }
      revokeSceneModelObjectUrl(asset);
      throw error;
    },
  );
  sceneModelLoadCache.set(asset.cacheKey, loadPromise);

  return loadPromise;
}

function revokeSceneModelObjectUrl(asset: SceneModelAsset): void {
  if (
    !asset.data ||
    typeof URL === "undefined" ||
    typeof URL.revokeObjectURL !== "function"
  ) {
    return;
  }
  URL.revokeObjectURL(asset.url);
}

export function cloneObject3D(object: THREE.Object3D) {
  const clone = object.clone(true);
  clone.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }
    mesh.geometry = mesh.geometry?.clone();
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((material) => material.clone());
    } else if (mesh.material) {
      mesh.material = mesh.material.clone();
    }
  });

  return clone;
}

export function applyModelOverrideColor(
  object: THREE.Object3D,
  color: RgbaColor,
) {
  const [r, g, b, a] = color;
  const threeColor = new THREE.Color(clamp01(r), clamp01(g), clamp01(b));
  const opacity = clamp01(a);

  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) {
      return;
    }

    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    const clonedMaterials = materials.map((material) => {
      const clone = material.clone();
      if ("color" in clone && clone.color instanceof THREE.Color) {
        clone.color.copy(threeColor);
      }
      clone.opacity = opacity;
      clone.transparent = opacity < 1 || clone.transparent;
      return clone;
    });
    mesh.material = Array.isArray(mesh.material)
      ? clonedMaterials
      : clonedMaterials[0];
  });
}

export function disposeObject3D(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    materials.forEach((material) => material.dispose());
  });
}
