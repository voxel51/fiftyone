import { type Box3, Vector3, type Vector3Tuple } from "three";
import { DEFAULT_CAMERA_POSITION } from "../constants";
import type { Looker3dSettings } from "../settings";
import type { SavedCameraState } from "../types";
import { calculateCameraPositionForUpVector } from "../utils";
import { getOrthonormalAxis, getUpVectorFromAxis } from "./utils";

/**
 * Source from which the camera config was resolved.
 * Used for debugging and logging.
 */
export type CameraConfigSource =
  | "savedState"
  | "operatorOverride"
  | "scenePosition"
  | "pluginSettings"
  | "computedFromBbox"
  | "fallback";

export interface ResolvedCameraConfig {
  position: Vector3;
  target: Vector3;
  source: CameraConfigSource;
}

export interface CameraConfigSources {
  savedState: SavedCameraState | null;
  overriddenCameraPosition: [number, number, number] | null;
  scenePosition: Vector3Tuple | null;
  sceneLookAt: Vector3Tuple | null;
  pluginSettings: Looker3dSettings | null;
  boundingBox: Box3 | null;
  upVector: Vector3 | null;
}

const isFiniteVector3 = (vector: Vector3): boolean => {
  return (
    Number.isFinite(vector.x) &&
    Number.isFinite(vector.y) &&
    Number.isFinite(vector.z)
  );
};

const isFiniteBbox = (bbox: Box3 | null): bbox is Box3 =>
  bbox !== null && isFiniteVector3(bbox.min) && isFiniteVector3(bbox.max);

export interface UpVectorConfigSources {
  sceneUpAxis: string | null | undefined;
  pluginDefaultUp: Looker3dSettings["defaultUp"] | undefined;
}

export interface UpVectorResolutionSources extends UpVectorConfigSources {
  storedUpVector: Vector3 | null;
}

/**
 * Resolves the configured up vector (scene config -> plugin setting -> hardcoded fallback).
 */
export const resolveConfiguredUpVector = ({
  sceneUpAxis,
  pluginDefaultUp,
}: UpVectorConfigSources): Vector3 => {
  const sceneUpVector = getUpVectorFromAxis(sceneUpAxis);
  if (sceneUpVector) {
    return sceneUpVector;
  }

  if (pluginDefaultUp && getOrthonormalAxis(pluginDefaultUp)) {
    return new Vector3(
      pluginDefaultUp[0],
      pluginDefaultUp[1],
      pluginDefaultUp[2]
    );
  }

  // default to z-up
  return new Vector3(0, 0, 1);
};

/**
 * Resolves the effective up vector with persistence semantics:
 * 1. scene config wins and overrides stored value
 * 2. otherwise keep last stored value
 * 3. otherwise initialize from configured defaults
 */
export const resolveUpVector = ({
  sceneUpAxis,
  pluginDefaultUp,
  storedUpVector,
}: UpVectorResolutionSources): Vector3 => {
  const sceneUpVector = getUpVectorFromAxis(sceneUpAxis);
  if (sceneUpVector) {
    return storedUpVector?.equals(sceneUpVector)
      ? storedUpVector
      : sceneUpVector;
  }

  return (
    storedUpVector ??
    resolveConfiguredUpVector({
      sceneUpAxis,
      pluginDefaultUp,
    })
  );
};

/**
 * Resolves the initial camera position and target from all available sources.
 *
 * Precedence:
 * 1. savedState (localStorage) — both position and target
 * 2. operatorOverride (cameraPositionAtom set by operator) — position only, target from sceneLookAt or bbox center or origin
 * 3. scenePosition (foScene.cameraProps.position) — position, target from sceneLookAt or bbox center or origin
 * 4. pluginSettings (defaultCameraPosition) — position only, target from bbox center or origin
 * 5. computedFromBbox — position computed from bbox + upVector, target at bbox center
 * 6. fallback — DEFAULT_CAMERA_POSITION, target at origin
 */
export const resolveCameraConfig = (
  sources: CameraConfigSources
): ResolvedCameraConfig => {
  const {
    savedState,
    overriddenCameraPosition,
    scenePosition,
    sceneLookAt,
    pluginSettings,
    boundingBox,
    upVector,
  } = sources;

  // Helper to resolve target: sceneLookAt -> bbox center -> origin
  const resolveTarget = (): Vector3 => {
    if (sceneLookAt?.length === 3) {
      return new Vector3(sceneLookAt[0], sceneLookAt[1], sceneLookAt[2]);
    }
    if (isFiniteBbox(boundingBox)) {
      return boundingBox.getCenter(new Vector3());
    }
    return new Vector3(0, 0, 0);
  };

  // 1. Saved state — has both position and target
  if (savedState) {
    return {
      position: new Vector3(
        savedState.position[0],
        savedState.position[1],
        savedState.position[2]
      ),
      target: new Vector3(
        savedState.target[0],
        savedState.target[1],
        savedState.target[2]
      ),
      source: "savedState",
    };
  }

  // 2. Operator override
  if (overriddenCameraPosition?.length === 3) {
    return {
      position: new Vector3(
        overriddenCameraPosition[0],
        overriddenCameraPosition[1],
        overriddenCameraPosition[2]
      ),
      target: resolveTarget(),
      source: "operatorOverride",
    };
  }

  // 3. Scene-defined position
  if (scenePosition) {
    return {
      position: new Vector3(
        scenePosition[0],
        scenePosition[1],
        scenePosition[2]
      ),
      target: resolveTarget(),
      source: "scenePosition",
    };
  }

  // 4. Plugin settings
  if (pluginSettings?.defaultCameraPosition) {
    const pos = pluginSettings.defaultCameraPosition;
    return {
      position: new Vector3(pos.x, pos.y, pos.z),
      target: resolveTarget(),
      source: "pluginSettings",
    };
  }

  // 5. Computed from bounding box
  if (isFiniteBbox(boundingBox) && upVector) {
    const center = boundingBox.getCenter(new Vector3());
    const size = boundingBox.getSize(new Vector3());

    return {
      position: calculateCameraPositionForUpVector(
        center,
        size,
        upVector,
        2.5,
        "top"
      ),
      target: center.clone(),
      source: "computedFromBbox",
    };
  }

  // 6. Fallback
  return {
    position: DEFAULT_CAMERA_POSITION(),
    target: new Vector3(0, 0, 0),
    source: "fallback",
  };
};

export interface ViewConfigSources {
  boundingBox: Box3;
  upVector: Vector3 | null;
  overriddenCameraPosition: [number, number, number] | null;
  scenePosition: Vector3Tuple | null;
  pluginSettings: Looker3dSettings | null;
}

/**
 * Resolves camera position and target for user-triggered view changes (T/E keys).
 * Never considers saved state (user explicitly chose a new view).
 *
 * - "top": camera positioned along up vector, looking at bbox center
 * - "pov": camera at operator/scene/plugin/computed position, looking at origin
 */
export const resolveViewConfig = (
  view: "pov" | "top",
  sources: ViewConfigSources
): { position: Vector3; target: Vector3 } => {
  const {
    boundingBox,
    upVector,
    overriddenCameraPosition,
    scenePosition,
    pluginSettings,
  } = sources;

  if (view === "top") {
    const center = isFiniteBbox(boundingBox)
      ? boundingBox.getCenter(new Vector3())
      : new Vector3(0, 0, 0);

    if (isFiniteBbox(boundingBox) && upVector) {
      const size = boundingBox.getSize(new Vector3());
      return {
        position: calculateCameraPositionForUpVector(
          center,
          size,
          upVector,
          2.5,
          "top"
        ),
        target: center.clone(),
      };
    }

    return {
      position: DEFAULT_CAMERA_POSITION(),
      target: center.clone(),
    };
  }

  // "pov" view — camera at resolved position, looking at origin
  const target = new Vector3(0, 0, 0);

  if (overriddenCameraPosition?.length === 3) {
    return {
      position: new Vector3(
        overriddenCameraPosition[0],
        overriddenCameraPosition[1],
        overriddenCameraPosition[2]
      ),
      target,
    };
  }

  if (scenePosition) {
    return {
      position: new Vector3(
        scenePosition[0],
        scenePosition[1],
        scenePosition[2]
      ),
      target,
    };
  }

  if (pluginSettings?.defaultCameraPosition) {
    const pos = pluginSettings.defaultCameraPosition;
    return {
      position: new Vector3(pos.x, pos.y, pos.z),
      target,
    };
  }

  if (isFiniteBbox(boundingBox) && upVector) {
    const size = boundingBox.getSize(new Vector3());
    return {
      position: calculateCameraPositionForUpVector(
        new Vector3(0, 0, 0),
        size,
        upVector,
        1.5,
        "pov"
      ),
      target,
    };
  }

  return {
    position: DEFAULT_CAMERA_POSITION(),
    target,
  };
};
