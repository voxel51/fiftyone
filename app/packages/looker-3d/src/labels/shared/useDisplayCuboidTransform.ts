import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import * as THREE from "three";
import { getCuboidResizeQuaternion } from "../../annotation/cuboid-face-resize";
import { useTransientCuboid } from "../../annotation/store";
import type { LabelId } from "../../annotation/store/types";
import { transformModeAtom } from "../../state";

export interface UseDisplayCuboidTransformArgs {
  labelId: LabelId;
  effectiveLocation: THREE.Vector3Tuple;
  effectiveDimensions: THREE.Vector3Tuple;
  effectiveRotation: THREE.Vector3Tuple;
  effectiveQuaternion: [number, number, number, number] | null;
  /**
   * Legacy-stored `location` is the cuboid's top-center (half-height above
   * the geometric center); the new format stores the geometric center
   * directly, matching `BoxGeometry`'s own center.
   */
  useLegacyCoordinates: boolean;
}

export interface UseDisplayCuboidTransformResult {
  /** Effective dimensions with any live transient (drag/scale) delta applied. */
  displayDimensions: THREE.Vector3Tuple;
  /** Effective position with any live transient (drag) delta applied. */
  displayPosition: THREE.Vector3Tuple;
  /** Live quaternion (transient override during active rotation, else working); null if only a fallback euler is available. */
  combinedQuaternion: THREE.Quaternion | null;
  /** Euler fallback for `<group rotation>` when `combinedQuaternion` is null. */
  fallbackEuler: THREE.Euler | undefined;
  /** Orientation for markers/handles — always populated (falls back to a quaternion derived from `effectiveRotation`). */
  orientationQuaternion: THREE.Quaternion;
}

/**
 * Resolves a cuboid's live, on-screen transform: the "effective" values from
 * `useCuboidAnnotation` (working-store value, or prop fallback), with any
 * in-progress transient drag/scale/rotate delta layered on top. Shared by
 * the standalone editing path and the instanced-batch renderer so both
 * compute the exact same transform — no seam when a box pops between them.
 */
export function useDisplayCuboidTransform({
  labelId,
  effectiveLocation,
  effectiveDimensions,
  effectiveRotation,
  effectiveQuaternion,
  useLegacyCoordinates,
}: UseDisplayCuboidTransformArgs): UseDisplayCuboidTransformResult {
  const transientState = useTransientCuboid(labelId);
  const transformMode = useRecoilValue(transformModeAtom);

  // Compute display dimensions: apply transient delta if present
  const displayDimensions = useMemo(() => {
    if (transientState?.dimensionsDelta) {
      return [
        effectiveDimensions[0] + transientState.dimensionsDelta[0],
        effectiveDimensions[1] + transientState.dimensionsDelta[1],
        effectiveDimensions[2] + transientState.dimensionsDelta[2],
      ] as THREE.Vector3Tuple;
    }
    return effectiveDimensions;
  }, [effectiveDimensions, transientState?.dimensionsDelta]);

  // Compute display position: apply transient delta if present
  const displayPosition = useMemo(() => {
    const [x, , z] = effectiveLocation;
    let y = effectiveLocation[1];

    // In legacy coordinate system, location was stored as the top-center of the cuboid
    // (half-height above the geometric center), so we adjust Y downward by half the height
    // to position the cuboid correctly. In the new coordinate system, location is stored
    // as the geometric center, matching Three.js BoxGeometry's center, so no adjustment is needed.
    if (useLegacyCoordinates) {
      y -= 0.5 * displayDimensions[1];
    }

    if (transientState?.positionDelta) {
      return [
        x + transientState.positionDelta[0],
        y + transientState.positionDelta[1],
        z + transientState.positionDelta[2],
      ] as THREE.Vector3Tuple;
    }
    return [x, y, z] as THREE.Vector3Tuple;
  }, [
    effectiveLocation,
    displayDimensions,
    useLegacyCoordinates,
    transientState?.positionDelta,
  ]);

  // When quaternion is present (transient or working), use it directly to avoid euler conversion issues
  // (gimbal lock, precision loss). We convert to euler only on final save.
  // Priority: transientState.quaternionOverride > effectiveQuaternion (working) > euler fallback
  const combinedQuaternion = useMemo(() => {
    // During active rotation, prefer transient quaternion override
    if (transformMode === "rotate" && transientState?.quaternionOverride) {
      return new THREE.Quaternion(...transientState.quaternionOverride);
    }
    // Otherwise use effective (working) quaternion if available
    if (effectiveQuaternion) {
      return new THREE.Quaternion(...effectiveQuaternion);
    }
    return null;
  }, [transientState?.quaternionOverride, effectiveQuaternion, transformMode]);

  // Fallback to euler-based rotation when no quaternion available
  const fallbackEuler = useMemo(() => {
    if (combinedQuaternion) {
      return undefined;
    }
    return new THREE.Euler(...(effectiveRotation as THREE.Vector3Tuple));
  }, [combinedQuaternion, effectiveRotation]);

  const orientationQuaternion = useMemo(() => {
    if (combinedQuaternion) {
      return combinedQuaternion.clone();
    }

    return getCuboidResizeQuaternion({
      rotation: effectiveRotation as THREE.Vector3Tuple,
    });
  }, [combinedQuaternion, effectiveRotation]);

  return {
    displayDimensions,
    displayPosition,
    combinedQuaternion,
    fallbackEuler,
    orientationQuaternion,
  };
}
