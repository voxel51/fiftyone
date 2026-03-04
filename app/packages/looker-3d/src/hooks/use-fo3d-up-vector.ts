import * as fos from "@fiftyone/state";
import { useEffect } from "react";
import { Vector3 } from "three";
import { resolveUpVector } from "../fo3d/camera-init";
import type { Looker3dSettings } from "../settings";
import type { FoScene } from "./use-fo3d";

export const useFo3dUpVector = (
  foScene: FoScene | null,
  pluginDefaultUp: Looker3dSettings["defaultUp"] | undefined
) => {
  const [upVector, setUpVectorVal] = fos.useBrowserStorage<Vector3>(
    "fo3d-up-vector",
    null,
    false,
    {
      parse: (upVectorStr) => {
        try {
          const [x, y, z] = JSON.parse(upVectorStr);
          return new Vector3(x, y, z);
        } catch (error) {
          return new Vector3(0, 1, 0);
        }
      },
      stringify: (storedUpVector) =>
        storedUpVector ? JSON.stringify(storedUpVector.toArray()) : "null",
    }
  );

  // scene config -> browser storage -> plugin default -> hardcoded default.
  useEffect(() => {
    if (!foScene) {
      return;
    }

    setUpVectorVal((storedUpVector) =>
      resolveUpVector({
        sceneUpAxis: foScene.cameraProps.up,
        pluginDefaultUp,
        storedUpVector,
      })
    );
  }, [foScene, pluginDefaultUp, setUpVectorVal]);

  return [upVector, setUpVectorVal] as const;
};
