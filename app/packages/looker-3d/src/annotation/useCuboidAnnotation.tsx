import { TransformControlsProps } from "@react-three/drei";
import { useCallback, useMemo, useRef } from "react";
import { useRecoilState } from "recoil";
import type { Vector3Tuple } from "three";
import * as THREE from "three";
import { stagedCuboidTransformsAtom, tempLabelTransformsAtom } from "../state";
import { deg2rad } from "../utils";
import { rad2deg, quaternionToEulerStable } from "./utils/rotation-utils";
import { useReverseSyncCuboidTransforms } from "./useReverseSyncCuboidTransforms";

interface UseCuboidAnnotationProps {
  label: any;
  location: Vector3Tuple;
  dimensions: Vector3Tuple;
  itemRotation: Vector3Tuple;
  strokeAndFillColor: string;
  isAnnotateMode: boolean;
  isSelectedForAnnotation: boolean;
}

export const useCuboidAnnotation = ({
  label,
  location,
  dimensions,
  itemRotation,
  strokeAndFillColor,
  isAnnotateMode,
  isSelectedForAnnotation,
}: UseCuboidAnnotationProps) => {
  const [stagedCuboidTransforms, setStagedCuboidTransforms] = useRecoilState(
    stagedCuboidTransformsAtom
  );

  // Reverse sync: when staged transforms change from canvas manipulation,
  // sync back to the sidebar
  useReverseSyncCuboidTransforms();

  // Note: For cuboids, `position` means relative offset (delta)
  const [tempCuboidTransforms, setTempCuboidTransforms] = useRecoilState(
    tempLabelTransformsAtom(label._id)
  );

  const transformControlsRef = useRef<TransformControlsProps>(null);
  const contentRef = useRef<THREE.Group>(null);

  // Track previous rotation for polarity stabilization when converting quaternion to euler
  const previousRotationRef = useRef<[number, number, number] | null>(null);

  // Apply staged transforms if they exist, otherwise use original values
  const [effectiveLocation, effectiveDimensions, effectiveRotation] = useMemo(
    () => [
      stagedCuboidTransforms[label._id]?.location ?? location,
      stagedCuboidTransforms[label._id]?.dimensions ?? dimensions,
      stagedCuboidTransforms[label._id]?.rotation ?? itemRotation,
    ],
    [stagedCuboidTransforms, location, dimensions, itemRotation]
  );

  const handleTransformChange = useCallback(() => {
    if (!contentRef.current || !transformControlsRef.current) return;

    const transformControls = transformControlsRef.current as any;
    const mode = transformControls.mode;

    if (mode === "translate") {
      const position = contentRef.current.position;
      setTempCuboidTransforms({
        position: position.toArray(),
      });
    } else if (mode === "scale") {
      // Compute transient dimensions from scale
      const scale = contentRef.current.scale;

      const transientDimensions: [number, number, number] = [
        effectiveDimensions[0] * scale.x,
        effectiveDimensions[1] * scale.y,
        effectiveDimensions[2] * scale.z,
      ];

      setTempCuboidTransforms({
        // Note: make sure with scale, position is (0,0,0) to avoid double application of position
        position: [0, 0, 0],
        dimensions: transientDimensions,
      });

      // Reset scale to avoid double application of scale
      contentRef.current.scale.set(1, 1, 1);
    } else if (mode === "rotate") {
      // Get quaternion from the transform controls and convert to Euler angles
      const quaternion = contentRef.current.quaternion;
      const quaternionArray: [number, number, number, number] = [
        quaternion.x,
        quaternion.y,
        quaternion.z,
        quaternion.w,
      ];

      // Use polarity-stable conversion to avoid discontinuous jumps
      // Reference is the effective rotation (current committed rotation)
      // Note: effectiveRotation is in radians, quaternionToEulerStable works in degrees
      const referenceRotationRadians =
        previousRotationRef.current ?? effectiveRotation;
      const referenceRotationDegrees: [number, number, number] = [
        rad2deg(referenceRotationRadians[0]),
        rad2deg(referenceRotationRadians[1]),
        rad2deg(referenceRotationRadians[2]),
      ];

      const eulerDegrees = quaternionToEulerStable(
        quaternionArray,
        referenceRotationDegrees
      );

      // Convert back to radians for storage (our internal representation uses radians)
      const eulerRadians: [number, number, number] = [
        deg2rad(eulerDegrees[0]),
        deg2rad(eulerDegrees[1]),
        deg2rad(eulerDegrees[2]),
      ];

      setTempCuboidTransforms({
        position: [0, 0, 0],
        rotation: eulerRadians,
      });
    }
  }, [effectiveDimensions, effectiveRotation]);

  const handleTransformEnd = useCallback(() => {
    if (!contentRef.current || !transformControlsRef.current) return;

    const transformControls = transformControlsRef.current as any;
    const mode = transformControls.mode;

    const newTransform: {
      location: number[];
      dimensions: number[];
      rotation?: Vector3Tuple;
    } = {
      location: [...effectiveLocation],
      dimensions: [...effectiveDimensions],
      rotation: effectiveRotation,
    };

    // Read from temp transforms, commit, and clear
    const tempTransforms = tempCuboidTransforms;

    if (mode === "translate" && tempTransforms?.position) {
      // Commit position change - add the delta (from temp transforms) to effectiveLocation
      const delta = tempTransforms.position;
      newTransform.location = [
        effectiveLocation[0] + delta[0],
        effectiveLocation[1] + delta[1],
        effectiveLocation[2] + delta[2],
      ] as Vector3Tuple;
    } else if (mode === "scale" && tempTransforms?.dimensions) {
      // Commit scale/dimensions change from temp transforms
      newTransform.dimensions = tempTransforms.dimensions as Vector3Tuple;
    } else if (mode === "rotate" && tempTransforms?.rotation) {
      // Commit rotation change from temp transforms
      newTransform.rotation = tempTransforms.rotation as Vector3Tuple;

      // Update the previous rotation ref for polarity stabilization
      previousRotationRef.current = tempTransforms.rotation as [
        number,
        number,
        number
      ];
    }

    setStagedCuboidTransforms((prev) => ({
      ...prev,
      [label._id]: newTransform,
    }));

    if (contentRef.current) {
      contentRef.current.position.set(0, 0, 0);
      contentRef.current.scale.set(1, 1, 1);
      // Reset rotation to identity - the committed rotation will be applied via effectiveRotation
      // contentRef.current.quaternion.set(0, 0, 0, 1);
    }

    setTempCuboidTransforms(null);
  }, [
    effectiveLocation,
    effectiveDimensions,
    effectiveRotation,
    label._id,
    tempCuboidTransforms,
  ]);

  return {
    location,
    isAnnotateMode,
    isSelectedForAnnotation,
    effectiveLocation,
    effectiveDimensions,
    effectiveRotation,

    transformControlsRef,
    contentRef,

    handleTransformChange,
    handleTransformEnd,
  };
};
