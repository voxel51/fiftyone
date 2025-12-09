import * as fos from "@fiftyone/state";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import type { Vector3Tuple } from "three";
import * as THREE from "three";
import {
  currentActiveAnnotationField3dAtom,
  stagedCuboidTransformsAtom,
  tempLabelTransformsAtom,
} from "../state";

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
  const currentSampleId = useRecoilValue(fos.currentSampleId);
  const currentActiveField = useRecoilValue(currentActiveAnnotationField3dAtom);
  const [stagedCuboidTransforms, setStagedCuboidTransforms] = useRecoilState(
    stagedCuboidTransformsAtom
  );

  const setTempCuboidTransforms = useSetRecoilState(
    tempLabelTransformsAtom(label._id)
  );

  const transformControlsRef = useRef(null);
  const contentRef = useRef<THREE.Group>(null);
  const [startMatrix, setStartMatrix] = useState<THREE.Matrix4 | null>(null);

  // Calculate centroid based on location
  const centroid = useMemo(() => {
    return location as [number, number, number];
  }, [location]);

  // Get current staged transforms for this cuboid
  const currentStagedTransform = useMemo(() => {
    return stagedCuboidTransforms[label._id];
  }, [stagedCuboidTransforms, label._id]);

  // Apply staged transforms if they exist, otherwise use original values
  const effectiveLocation = useMemo(() => {
    return currentStagedTransform?.location ?? location;
  }, [currentStagedTransform?.location, location]);

  const effectiveDimensions = useMemo(() => {
    return currentStagedTransform?.dimensions ?? dimensions;
  }, [currentStagedTransform?.dimensions, dimensions]);

  // Use original itemRotation - no transform controls rotation support
  const effectiveRotation = useMemo(() => {
    return itemRotation;
  }, [itemRotation]);

  // Transform handlers
  const handleTransformStart = useCallback(() => {
    if (!contentRef.current) return;

    // Store the starting matrix for reference
    const matrix = new THREE.Matrix4();
    matrix.copy(contentRef.current.matrixWorld);
    setStartMatrix(matrix);
  }, []);

  const handleTransformChange = useCallback(() => {
    if (!contentRef.current || !transformControlsRef.current) return;

    const transformControls = transformControlsRef.current as any;
    const mode = transformControls.mode;

    if (mode === "translate") {
      // Update position
      const position = contentRef.current.position;
      setTempCuboidTransforms({
        position: position.toArray() as [number, number, number],
      });
    } else if (mode === "scale") {
      // Update dimensions - compute transient dimensions from scale
      const scale = contentRef.current.scale;
      const originalDims = currentStagedTransform?.dimensions ?? dimensions;
      const transientDimensions: [number, number, number] = [
        originalDims[0] * scale.x,
        originalDims[1] * scale.y,
        originalDims[2] * scale.z,
      ];

      const originalPosition = new THREE.Vector3();
      originalPosition.setFromMatrixPosition(startMatrix);
      setTempCuboidTransforms({
        position: originalPosition.toArray() as [number, number, number],
        dimensions: transientDimensions,
      });
    }
  }, [
    setTempCuboidTransforms,
    currentStagedTransform?.dimensions,
    dimensions,
    startMatrix,
  ]);

  const handleTransformEnd = useCallback(() => {
    if (!contentRef.current || !transformControlsRef.current) return;

    const transformControls = transformControlsRef.current as any;
    const mode = transformControls.mode;

    const newTransform = { ...currentStagedTransform };

    if (mode === "translate") {
      // Commit position change - add the delta (group position) to effectiveLocation
      const delta = contentRef.current.position;
      newTransform.location = [
        effectiveLocation[0] + delta.x,
        effectiveLocation[1] + delta.y,
        effectiveLocation[2] + delta.z,
      ] as Vector3Tuple;
    } else if (mode === "scale") {
      // Commit scale/dimensions change
      const scale = contentRef.current.scale;
      // Scale the original dimensions
      const originalDims = currentStagedTransform?.dimensions ?? dimensions;
      newTransform.dimensions = [
        originalDims[0] * scale.x,
        originalDims[1] * scale.y,
        originalDims[2] * scale.z,
      ] as Vector3Tuple;
      // Reset scale after applying to dimensions
      contentRef.current.scale.set(1, 1, 1);
    }

    setStagedCuboidTransforms((prev) => ({
      ...prev,
      [label._id]: newTransform,
    }));

    // Reset group transforms to prevent double-application
    // This is important because transform controls are applied to the group
    // whereas we render the cuboid using effective values
    if (contentRef.current) {
      contentRef.current.position.set(0, 0, 0);
    }

    // Clear temp transforms
    setTempCuboidTransforms(null);
    setStartMatrix(null);
  }, [
    currentStagedTransform,
    dimensions,
    effectiveLocation,
    label._id,
    setStagedCuboidTransforms,
    setTempCuboidTransforms,
  ]);

  const handlePointerOver = useCallback(() => {
    // Could be used for additional hover effects in annotation mode
  }, []);

  const handlePointerOut = useCallback(() => {
    // Could be used for additional hover effects in annotation mode
  }, []);

  // Sync staged transforms back to the label data when needed
  useEffect(() => {
    if (!isAnnotateMode || !isSelectedForAnnotation) return;

    // This could be used to sync data back to the server
    // For now, we just keep it in staged state
  }, [isAnnotateMode, isSelectedForAnnotation, currentStagedTransform]);

  return {
    // State
    centroid,
    isAnnotateMode,
    isSelectedForAnnotation,
    effectiveLocation,
    effectiveDimensions,
    effectiveRotation,

    // Refs
    transformControlsRef,
    contentRef,

    // Handlers
    handleTransformStart,
    handleTransformChange,
    handleTransformEnd,
    handlePointerOver,
    handlePointerOut,
  };
};
