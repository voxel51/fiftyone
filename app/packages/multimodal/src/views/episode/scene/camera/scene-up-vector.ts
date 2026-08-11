import { Vector3 } from "three";
import type { Scene3dUpAxis } from "../../spatial/view-preferences";

const SCENE_UP_VECTORS: Record<Scene3dUpAxis, Vector3> = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
};

export function sceneUpVector(sceneUpAxis: Scene3dUpAxis): Vector3 {
  return SCENE_UP_VECTORS[sceneUpAxis].clone();
}
