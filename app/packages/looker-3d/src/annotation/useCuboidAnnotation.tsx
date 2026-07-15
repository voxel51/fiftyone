import {
  encodeEntityId,
  GEOMETRY_SIGNAL,
  type GeometrySignal,
  useAnnotationEngine,
  useSceneSampleId,
} from "@fiftyone/annotation";
import { useCurrentDatasetId } from "@fiftyone/state";
import { TransformControlsProps } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Vector3Tuple } from "three";
import * as THREE from "three";
import {
  useCuboidOperations,
  useEndDrag,
  useStartDrag,
  useUpdateTransient,
  useWorkingLabel,
} from "../annotation/store";
import type { TransientCuboidState } from "../annotation/store/types";
import { isDetection3dOverlay } from "../types";
import { radiansToQuaternion } from "../utils";

interface UseCuboidAnnotationProps {
  label: any;
  location: Vector3Tuple;
  dimensions: Vector3Tuple;
  rotation: Vector3Tuple;
  isAnnotateMode: boolean;
  isSelectedForAnnotation: boolean;
}

export const useCuboidAnnotation = ({
  label,
  location,
  dimensions,
  rotation,
  isAnnotateMode,
  isSelectedForAnnotation,
}: UseCuboidAnnotationProps) => {
  const labelId = label._id;

  const workingLabel = useWorkingLabel(labelId);
  const { updateCuboid } = useUpdateTransient();
  const { finalizeCuboidDrag } = useCuboidOperations();
  const startDrag = useStartDrag();
  const endDrag = useEndDrag();

  const engine = useAnnotationEngine();
  const dataset = useCurrentDatasetId() ?? "";
  const sample = useSceneSampleId();

  const transformControlsRef = useRef<TransformControlsProps>(null);
  const contentRef = useRef<THREE.Group>(null);

  // Compute effective values from working store (or fallback to props)
  const [
    effectiveLocation,
    effectiveDimensions,
    effectiveRotation,
    effectiveQuaternion,
  ] = useMemo<
    [
      Vector3Tuple,
      Vector3Tuple,
      Vector3Tuple,
      [number, number, number, number] | null,
    ]
  >(() => {
    if (isDetection3dOverlay(workingLabel)) {
      return [
        workingLabel.location,
        workingLabel.dimensions,
        workingLabel.rotation ?? rotation,
        workingLabel.quaternion ?? null,
      ];
    }
    // Fallback to props if not in working store
    return [location, dimensions, rotation, null];
  }, [workingLabel, location, dimensions, rotation]);

  // Publish absolute cuboid geometry mid-gesture so sidebar observers (the
  // position panel) preview it without reaching into the working/transient
  // store. Render-only — the committed write still lands at drag-end. The
  // payload is ABSOLUTE (location/dimensions/quaternion = base + transient
  // delta) so the observer stays surface-agnostic, mirroring the 2D path.
  const publishLiveGeometry = useCallback(
    (
      location: Vector3Tuple,
      dimensions: Vector3Tuple,
      quaternion: [number, number, number, number],
    ) => {
      const path = isDetection3dOverlay(workingLabel)
        ? workingLabel.path
        : undefined;

      if (!sample || !path) {
        return;
      }

      engine.publishSignal<GeometrySignal>(
        GEOMETRY_SIGNAL,
        encodeEntityId(dataset, { sample, path, instanceId: labelId }),
        { kind: "3d", location, dimensions, quaternion },
      );
    },
    [engine, dataset, sample, workingLabel, labelId],
  );

  const handleTransformStart = useCallback(() => {
    startDrag(labelId);
  }, [startDrag, labelId]);

  const handleTransformChange = useCallback(() => {
    if (!contentRef.current || !transformControlsRef.current) return;

    const transformControls = transformControlsRef.current;
    const mode = transformControls.mode;

    const transientUpdate: TransientCuboidState = {};

    // live absolute geometry — base, overridden by the active gesture mode
    let liveLocation = effectiveLocation;
    let liveDimensions = effectiveDimensions;
    let liveQuaternion =
      effectiveQuaternion ?? radiansToQuaternion(effectiveRotation);

    if (mode === "translate") {
      const position = contentRef.current.position;
      // Store position as delta from effective location
      transientUpdate.positionDelta = [
        position.x - effectiveLocation[0],
        position.y - effectiveLocation[1],
        position.z - effectiveLocation[2],
      ];
      liveLocation = [position.x, position.y, position.z] as Vector3Tuple;
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
      liveDimensions = newDimensions;

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
      liveQuaternion = transientUpdate.quaternionOverride;
    }

    // Update transient store (drives the scene render)
    updateCuboid(labelId, transientUpdate);

    // mirror the absolute geometry to sidebar observers via the signal pipe
    publishLiveGeometry(liveLocation, liveDimensions, liveQuaternion);
  }, [
    labelId,
    effectiveLocation,
    effectiveDimensions,
    effectiveRotation,
    effectiveQuaternion,
    updateCuboid,
    publishLiveGeometry,
  ]);

  const handleTransformEnd = useCallback(() => {
    if (!contentRef.current || !transformControlsRef.current) {
      return;
    }

    finalizeCuboidDrag(labelId);

    // We'll have accounted for scale by mutating dimensions, so reset scale
    contentRef.current.scale.set(1, 1, 1);
  }, [labelId, finalizeCuboidDrag]);

  const handleFaceResizeStart = useCallback(() => {
    startDrag(labelId);
  }, [startDrag, labelId]);

  const handleFaceResizeChange = useCallback(
    (transientUpdate: TransientCuboidState) => {
      updateCuboid(labelId, transientUpdate);
    },
    [labelId, updateCuboid],
  );

  const handleFaceResizeEnd = useCallback(() => {
    finalizeCuboidDrag(labelId);
  }, [labelId, finalizeCuboidDrag]);

  // This effect clears drag state on unmount
  useEffect(() => {
    return () => endDrag(labelId);
  }, [labelId, endDrag]);

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
    handleFaceResizeStart,
    handleFaceResizeChange,
    handleFaceResizeEnd,
  };
};
