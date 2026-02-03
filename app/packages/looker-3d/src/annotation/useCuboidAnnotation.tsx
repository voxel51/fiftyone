import { TransformControlsProps } from "@react-three/drei";
import { useCallback, useMemo, useRef } from "react";
import type { Vector3Tuple } from "three";
import * as THREE from "three";
import {
  useCuboidOperations,
  useStartDrag,
  useTransientCuboid,
  useUpdateTransient,
  useWorkingLabel,
} from "../annotation/store";
import type { TransientCuboidState } from "../annotation/store/types";
import { isDetection3dOverlay } from "../types";

interface UseCuboidAnnotationProps {
  label: any;
  location: Vector3Tuple;
  dimensions: Vector3Tuple;
  rotation: Vector3Tuple;
  strokeAndFillColor: string;
  isAnnotateMode: boolean;
  isSelectedForAnnotation: boolean;
}

export const useCuboidAnnotation = ({
  label,
  location,
  dimensions,
  rotation,
  strokeAndFillColor,
  isAnnotateMode,
  isSelectedForAnnotation,
}: UseCuboidAnnotationProps) => {
  const labelId = label._id;

  const workingLabel = useWorkingLabel(labelId);
  const transientState = useTransientCuboid(labelId);
  const { updateCuboid } = useUpdateTransient();
  const { finalizeCuboidDrag } = useCuboidOperations();
  const startDrag = useStartDrag();

  const transformControlsRef = useRef<TransformControlsProps>(null);
  const contentRef = useRef<THREE.Group>(null);

  // Compute effective values from working store (or fallback to props)
  const [
    effectiveLocation,
    effectiveDimensions,
    effectiveRotation,
    effectiveQuaternion,
  ] = useMemo(() => {
    if (isDetection3dOverlay(workingLabel)) {
      const result = [
        workingLabel.location,
        workingLabel.dimensions,
        workingLabel.rotation ?? rotation,
        workingLabel.quaternion ?? null,
      ];
      return result;
    }
    // Fallback to props if not in working store
    return [location, dimensions, rotation, null];
  }, [workingLabel, location, dimensions, rotation]);

  const handleTransformStart = useCallback(() => {
    startDrag();
  }, [startDrag]);

  const handleTransformChange = useCallback(() => {
    if (!contentRef.current || !transformControlsRef.current) return;

    const transformControls = transformControlsRef.current;
    const mode = transformControls.mode;

    let transientUpdate: TransientCuboidState = {};

    if (mode === "translate") {
      const position = contentRef.current.position;
      // Store position as delta from effective location
      transientUpdate.positionDelta = [
        position.x - effectiveLocation[0],
        position.y - effectiveLocation[1],
        position.z - effectiveLocation[2],
      ];
    } else if (mode === "scale") {
      // Compute transient dimensions delta from scale
      const scale = contentRef.current.scale;

      const newDimensions: [number, number, number] = [
        effectiveDimensions[0] * scale.x,
        effectiveDimensions[1] * scale.y,
        effectiveDimensions[2] * scale.z,
      ];

      transientUpdate.dimensionsDelta = [
        newDimensions[0] - effectiveDimensions[0],
        newDimensions[1] - effectiveDimensions[1],
        newDimensions[2] - effectiveDimensions[2],
      ];

      // Reset scale to avoid double application
      contentRef.current.scale.set(1, 1, 1);
    } else if (mode === "rotate") {
      const quaternion = contentRef.current.quaternion.clone();
      transientUpdate.quaternionOverride = [
        quaternion.x,
        quaternion.y,
        quaternion.z,
        quaternion.w,
      ];
    }

    // Update transient store
    updateCuboid(labelId, transientUpdate);
  }, [labelId, effectiveLocation, effectiveDimensions, updateCuboid]);

  const handleTransformEnd = useCallback(() => {
    if (!contentRef.current || !transformControlsRef.current) {
      return;
    }

    const currentTransient = transientState;

    if (!currentTransient) {
      return;
    }

    finalizeCuboidDrag(labelId, currentTransient);

    // Reset the Three.js object scale after committing
    if (contentRef.current) {
      contentRef.current.scale.set(1, 1, 1);
      // Don't reset quaternion - it's an override, not a delta
    }
  }, [labelId, transientState, finalizeCuboidDrag]);

  return {
    location,
    isAnnotateMode,
    isSelectedForAnnotation,
    effectiveLocation,
    effectiveDimensions,
    effectiveRotation,
    effectiveQuaternion,

    transformControlsRef,
    contentRef,

    handleTransformStart,
    handleTransformChange,
    handleTransformEnd,
  };
};
