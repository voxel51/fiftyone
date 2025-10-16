import * as fos from "@fiftyone/state";
import { Line as LineDrei } from "@react-three/drei";
import chroma from "chroma-js";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import * as THREE from "three";
import { PolylinePointMarker } from "../annotation/PolylinePointMarker";
import {
  hoveredLabelAtom,
  hoveredPolylineInfoAtom,
  polylineEffectivePointsAtom,
  polylinePointTransformsAtom,
  selectedLabelForAnnotationAtom,
} from "../state";
import type { PolylinePointTransform } from "../annotation/types";
import { createFilledPolygonMeshes } from "./polygon-fill-utils";
import type { OverlayProps } from "./shared";
import { useEventHandlers, useHoverState, useLabelColor } from "./shared/hooks";
import { Transformable } from "./shared/TransformControls";
import {
  applyTransformsToPolyline,
  applyDeltaToAllPoints,
} from "../annotation/utils/polyline-utils";

export interface PolyLineProps extends OverlayProps {
  // Array of line segments, where each segment is an array of 3D points
  points3d: THREE.Vector3Tuple[][];
  filled: boolean;
  lineWidth?: number;
  // We ignore closed for now
  closed?: boolean;
}

export const Polyline = ({
  opacity,
  filled,
  rotation,
  points3d,
  color,
  selected,
  lineWidth,
  onClick,
  tooltip,
  label,
}: PolyLineProps) => {
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const [polylinePointTransforms, setPolylinePointTransforms] = useRecoilState(
    polylinePointTransformsAtom
  );
  const isAnnotateMode = useAtomValue(fos.modalMode) === "annotate";
  const isSelectedForAnnotation =
    useRecoilValue(selectedLabelForAnnotationAtom)?._id === label._id;

  const { isHovered, setIsHovered } = useHoverState();
  const { onPointerOver, onPointerOut, restEventHandlers } = useEventHandlers(
    tooltip,
    label
  );
  const { strokeAndFillColor } = useLabelColor(
    { selected, color },
    isHovered,
    label,
    isSelectedForAnnotation
  );

  const setHoveredLabel = useSetRecoilState(hoveredLabelAtom);
  const setHoveredPolylineInfo = useSetRecoilState(hoveredPolylineInfoAtom);

  const [effectivePoints3d, setPolylineEffectivePoints] = useRecoilState(
    polylineEffectivePointsAtom(label._id)
  );

  // Compute the effective points by applying transformations
  useEffect(() => {
    const labelId = label._id;
    const transforms = polylinePointTransforms[labelId] || [];

    const result = applyTransformsToPolyline(points3d, transforms);
    setPolylineEffectivePoints(result);
  }, [polylinePointTransforms, label._id, points3d]);

  const lines = useMemo(
    () =>
      effectivePoints3d.map((pts, i) => (
        <LineDrei
          key={`polyline-${label._id}-${i}`}
          lineWidth={lineWidth}
          segments
          points={pts}
          color={strokeAndFillColor}
          rotation={rotation}
          onPointerOver={() => {
            if (isAnnotateMode) {
              setHoveredPolylineInfo({
                labelId: label._id,
                segmentIndex: i,
                // pointIndex is undefined when hovering over the segment
              });
            }
          }}
          onPointerOut={() => {
            if (isAnnotateMode) {
              setHoveredPolylineInfo(null);
            }
          }}
        />
      )),
    [
      effectivePoints3d,
      strokeAndFillColor,
      lineWidth,
      rotation,
      label._id,
      isAnnotateMode,
      setHoveredPolylineInfo,
    ]
  );

  const material = useMemo(() => {
    if (!filled) return null;

    return new THREE.MeshBasicMaterial({
      color: strokeAndFillColor,
      opacity,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, [filled, strokeAndFillColor, opacity]);

  const filledMeshes = useMemo(() => {
    if (!filled || !material) return null;

    // Dispose previous meshes
    meshesRef.current.forEach((mesh) => {
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat) => mat.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    });

    const meshes = createFilledPolygonMeshes(effectivePoints3d, material);
    meshesRef.current = meshes || [];

    if (!meshes) return null;

    return meshes.map((mesh, idx) => (
      <primitive
        key={`filled-${label._id}-${idx}`}
        object={mesh}
        rotation={rotation as unknown as THREE.Euler}
      />
    ));
  }, [filled, effectivePoints3d, rotation, material, label._id]);

  // Calculate centroid of polylines for transform controls
  const centroid = useMemo(() => {
    if (effectivePoints3d.length === 0) return [0, 0, 0];

    const allPoints = effectivePoints3d.flat();
    if (allPoints.length === 0) return [0, 0, 0];

    const sum = allPoints.reduce(
      (acc, point) => [acc[0] + point[0], acc[1] + point[1], acc[2] + point[2]],
      [0, 0, 0]
    );

    return [
      sum[0] / allPoints.length,
      sum[1] / allPoints.length,
      sum[2] / allPoints.length,
    ] as [number, number, number];
  }, [effectivePoints3d]);

  const pointMarkers = useMemo(() => {
    if (!isAnnotateMode || !isSelectedForAnnotation) return null;

    // this is to have contrast for annotation,
    // or else the point markers would be invisible with large line widths
    const complementaryColor = chroma(strokeAndFillColor)
      .set("hsl.h", "+180")
      .hex();

    return effectivePoints3d.flatMap((segment, segmentIndex) => {
      let visitedPoints = new Set();

      return segment.map((point, pointIndex) => {
        const key = `${point[0]}-${point[1]}-${point[2]}-${segmentIndex}-${pointIndex}`;

        if (visitedPoints.has(key)) return null;

        visitedPoints.add(key);

        return (
          <PolylinePointMarker
            key={key}
            position={new THREE.Vector3(...point)}
            color={complementaryColor}
            isDraggable={true}
            labelId={label._id}
            segmentIndex={segmentIndex}
            pointIndex={pointIndex}
            onPointMove={(newPosition) => {
              setPolylinePointTransforms((prev) => {
                const labelId = label._id;
                const currentTransforms = prev[labelId] || [];

                const existingTransformIndex = currentTransforms.findIndex(
                  (transform) =>
                    transform.segmentIndex === segmentIndex &&
                    transform.pointIndex === pointIndex
                );

                const newTransform = {
                  segmentIndex,
                  pointIndex,
                  position: [newPosition.x, newPosition.y, newPosition.z] as [
                    number,
                    number,
                    number
                  ],
                };

                let newTransforms;
                if (existingTransformIndex >= 0) {
                  // Update existing transform
                  newTransforms = [...currentTransforms];
                  newTransforms[existingTransformIndex] = newTransform;
                } else {
                  // Add new transform
                  newTransforms = [...currentTransforms, newTransform];
                }

                return {
                  ...prev,
                  [labelId]: newTransforms,
                };
              });
            }}
            pulsate={false}
          />
        );
      });
    });
  }, [
    isAnnotateMode,
    isSelectedForAnnotation,
    effectivePoints3d,
    label._id,
    strokeAndFillColor,
  ]);

  const centroidMarker = useMemo(() => {
    if (!isAnnotateMode || !isSelectedForAnnotation) return null;

    const centroidColor = chroma(strokeAndFillColor)
      .set("hsl.h", "+180")
      .brighten(1.5)
      .hex();

    return (
      <PolylinePointMarker
        key={`centroid-${label._id}`}
        position={new THREE.Vector3(...centroid)}
        color={centroidColor}
        size={0.05}
        pulsate={false}
        labelId={label._id}
        segmentIndex={-1}
        pointIndex={-1}
      />
    );
  }, [
    isAnnotateMode,
    isSelectedForAnnotation,
    centroid,
    strokeAndFillColor,
    label._id,
  ]);

  useEffect(() => {
    return () => {
      meshesRef.current.forEach((mesh) => {
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((mat) => mat.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });
    };
  }, []);

  useEffect(() => {
    return () => {
      if (material) {
        material.dispose();
      }
    };
  }, [material]);

  const transformControlsRef = useRef(null);
  const contentRef = useRef<THREE.Group>(null);

  const handleTransformEnd = useCallback(() => {
    const controls = transformControlsRef.current;
    if (!controls) return;

    const grp = contentRef.current;
    if (!grp) return;

    const worldDelta = controls.offset.clone();

    setPolylinePointTransforms((prev) => {
      const labelId = label._id;
      const currentTransforms = prev[labelId] || [];

      const newTransforms = applyDeltaToAllPoints(
        effectivePoints3d,
        points3d,
        currentTransforms,
        [worldDelta.x, worldDelta.y, worldDelta.z]
      );

      return { ...prev, [labelId]: newTransforms };
    });

    // Reset group position to prevent double-application
    // This is important because transform controls are applied to the group
    // Whereas we create polylines from the effective points
    if (contentRef.current) {
      contentRef.current.position.set(0, 0, 0);
    }
  }, [label._id, points3d, effectivePoints3d]);

  const content = (
    <>
      {filled && filledMeshes}
      {lines}
      {centroidMarker}
    </>
  );

  const markers = (
    <group>
      {pointMarkers}
      {centroidMarker}
    </group>
  );

  return (
    <Transformable
      archetype="polyline"
      isSelectedForTransform={isSelectedForAnnotation}
      transformControlsPosition={centroid as THREE.Vector3Tuple}
      transformControlsRef={transformControlsRef}
      onTransformEnd={handleTransformEnd}
      explicitObjectRef={contentRef}
    >
      <group ref={contentRef}>
        {markers}
        <group
          onPointerOver={() => {
            setIsHovered(true);
            if (isAnnotateMode) {
              setHoveredLabel(label);
            }
            onPointerOver();
          }}
          onPointerOut={() => {
            setIsHovered(false);
            if (isAnnotateMode) {
              setHoveredLabel(null);
            }
            onPointerOut();
          }}
          onClick={onClick}
          {...restEventHandlers}
        >
          {content}
        </group>
      </group>
    </Transformable>
  );
};
