import { useThree } from "@react-three/fiber";
import { useCallback } from "react";
import type * as THREE from "three";
import type { ScenePointCloud } from "../annotation/fit-cuboid-to-points";

/**
 * Returns a getter that snapshots the point clouds currently mounted in the R3F
 * scene graph — their position buffers and world matrices — for geometric
 * queries (e.g. fitting a freshly created cuboid to the points it encloses).
 *
 * We detect point clouds via the `isPoints` flag rather than `instanceof
 * THREE.Points` because the app can end up with multiple three.js instances, in
 * which case `instanceof` checks across module boundaries are unreliable.
 *
 * The getter is intended to be called on a discrete user action (not per
 * frame): it walks the scene graph and clones each world matrix at call time.
 */
export const useScenePointClouds = () => {
  const scene = useThree((state) => state.scene);

  return useCallback((): ScenePointCloud[] => {
    const pointClouds: ScenePointCloud[] = [];

    scene.traverse((object) => {
      const points = object as THREE.Points;
      if (!points.isPoints) {
        return;
      }

      const positionAttribute = points.geometry?.getAttribute("position");
      if (!positionAttribute) {
        return;
      }

      object.updateWorldMatrix(true, false);

      pointClouds.push({
        positions: positionAttribute.array as ArrayLike<number>,
        matrixWorld: object.matrixWorld.clone(),
      });
    });

    return pointClouds;
  }, [scene]);
};
