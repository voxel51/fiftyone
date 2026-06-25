import * as fos from "@fiftyone/state";
import { useCallback, useEffect, useMemo } from "react";
import { Vector3 } from "three";
import { resolveUpVector } from "../fo3d/camera-init";
import type { FoScene } from "../fo3d/render-types";
import { getUpVectorFromAxis } from "../fo3d/utils";
import type { Looker3dSettings } from "../settings";

const UP_VECTOR_STORAGE_KEY = "fo3d-up-vector";
const UP_VECTOR_STORAGE_CODEC = {
  parse: (upVectorStr: string) => {
    try {
      const parsed = JSON.parse(upVectorStr);
      if (
        !Array.isArray(parsed) ||
        parsed.length !== 3 ||
        !parsed.every((value) => typeof value === "number")
      ) {
        return null;
      }

      const [x, y, z] = parsed;
      return new Vector3(x, y, z);
    } catch {
      return null;
    }
  },
  stringify: (storedUpVector: Vector3 | null) =>
    storedUpVector ? JSON.stringify(storedUpVector.toArray()) : "null",
};

/**
 * Resolves and persists up vector with storage scope based on scene config:
 * - scene-defined up axis => session storage
 * - no scene-defined up axis => local storage
 *
 * We have this split-strategy because:
 * - Scene-authored up axes are dataset/asset semantics, so overrides should not
 *   leak across tabs/sessions and surprise unrelated scenes.
 * - User-authored up axes for scenes without config are true viewer preferences,
 *   so they should persist across sessions.
 */
export const useFo3dUpVector = (
  foScene: FoScene | null,
  pluginDefaultUp: Looker3dSettings["defaultUp"] | undefined,
) => {
  const [localUpVector, setLocalUpVectorVal] =
    fos.useBrowserStorage<Vector3 | null>(
      UP_VECTOR_STORAGE_KEY,
      null,
      false,
      UP_VECTOR_STORAGE_CODEC,
    );

  const [sessionUpVector, setSessionUpVectorVal] =
    fos.useBrowserStorage<Vector3 | null>(
      UP_VECTOR_STORAGE_KEY,
      null,
      true,
      UP_VECTOR_STORAGE_CODEC,
    );

  const sceneUpAxis = foScene?.cameraProps.up;
  const sceneDefinesUpVector = Boolean(getUpVectorFromAxis(sceneUpAxis));
  const activeUpVector = sceneDefinesUpVector ? sessionUpVector : localUpVector;

  const setActiveUpVectorVal = useCallback(
    (value: Vector3 | null | ((v: Vector3 | null) => Vector3 | null)) => {
      if (sceneDefinesUpVector) {
        setSessionUpVectorVal(value);
        return;
      }

      setLocalUpVectorVal(value);
    },
    [sceneDefinesUpVector, setLocalUpVectorVal, setSessionUpVectorVal],
  );

  const resolveEffectiveUpVector = useCallback(
    (storedUpVector: Vector3 | null): Vector3 =>
      resolveUpVector({
        sceneUpAxis,
        pluginDefaultUp,
        storedUpVector,
      }),
    [sceneUpAxis, pluginDefaultUp],
  );

  // This effect keeps storage normalized to the resolved vector; equality guards
  // prevent no-op writes that can cause re-render loops.
  useEffect(() => {
    setActiveUpVectorVal((storedUpVector) => {
      const resolvedUpVector = resolveEffectiveUpVector(storedUpVector);

      if (storedUpVector?.equals(resolvedUpVector)) {
        return storedUpVector;
      }

      return resolvedUpVector;
    });
  }, [resolveEffectiveUpVector, sceneDefinesUpVector, setActiveUpVectorVal]);

  const upVector = useMemo(
    () => resolveEffectiveUpVector(activeUpVector),
    [activeUpVector, resolveEffectiveUpVector],
  );

  const setUpVectorVal = useCallback(
    (value: Vector3 | null | ((v: Vector3 | null) => Vector3 | null)) => {
      setActiveUpVectorVal((storedUpVector) => {
        const nextUpVector =
          typeof value === "function" ? value(storedUpVector) : value;

        if (storedUpVector?.equals(nextUpVector)) {
          return storedUpVector;
        }

        return nextUpVector;
      });
    },
    [setActiveUpVectorVal],
  );

  return [upVector, setUpVectorVal] as const;
};
