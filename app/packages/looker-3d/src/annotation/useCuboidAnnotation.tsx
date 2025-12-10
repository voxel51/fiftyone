import { TransformControlsProps } from "@react-three/drei";
import { useCallback, useMemo, useRef } from "react";
import { useRecoilState } from "recoil";
import type { Vector3Tuple } from "three";
import * as THREE from "three";
import { stagedCuboidTransformsAtom, tempLabelTransformsAtom } from "../state";
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

  // Apply staged transforms if they exist, otherwise use original values
  const [effectiveLocation, effectiveDimensions, effectiveRotation] = useMemo(
    () => [
      stagedCuboidTransforms[label._id]?.location ?? location,
      stagedCuboidTransforms[label._id]?.dimensions ?? dimensions,
      itemRotation,
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
    }
  }, [effectiveDimensions]);

  const handleTransformEnd = useCallback(() => {
    if (!contentRef.current || !transformControlsRef.current) return;

    const transformControls = transformControlsRef.current as any;
    const mode = transformControls.mode;

    const newTransform = {
      location: [...effectiveLocation],
      dimensions: [...effectiveDimensions],
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
    }

    setStagedCuboidTransforms((prev) => ({
      ...prev,
      [label._id]: newTransform,
    }));

    if (contentRef.current) {
      contentRef.current.position.set(0, 0, 0);
      contentRef.current.scale.set(1, 1, 1);
    }

    setTempCuboidTransforms(null);
  }, [effectiveLocation, effectiveDimensions, label._id, tempCuboidTransforms]);

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
