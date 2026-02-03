import * as fos from "@fiftyone/state";
import { extend } from "@react-three/fiber";
import chroma from "chroma-js";
import { useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry";
import { useTransientCuboid } from "../annotation/store";
import { useCuboidAnnotation } from "../annotation/useCuboidAnnotation";
import {
  current3dAnnotationModeAtom,
  hoveredLabelAtom,
  selectedLabelForAnnotationAtom,
  transformModeAtom,
} from "../state";
import type { OverlayProps } from "./shared";
import { useEventHandlers, useHoverState, useLabelColor } from "./shared/hooks";
import { Transformable } from "./shared/TransformControls";

extend({ LineSegments2, LineMaterial, LineSegmentsGeometry });

export interface CuboidProps extends OverlayProps {
  location: THREE.Vector3Tuple;
  dimensions: THREE.Vector3Tuple;
  itemRotation: THREE.Vector3Tuple;
  lineWidth?: number;
}

export const Cuboid = ({
  itemRotation,
  dimensions,
  opacity,
  rotation,
  location,
  lineWidth,
  selected,
  onClick,
  tooltip,
  label,
  color,
  useLegacyCoordinates,
}: CuboidProps) => {
  useHoverState();
  const hoveredLabel = useRecoilValue(hoveredLabelAtom);
  const setHoveredLabel = useSetRecoilState(hoveredLabelAtom);

  const isHovered = hoveredLabel?.id === label._id;

  const isAnnotateMode = useAtomValue(fos.modalMode) === "annotate";
  const isSelectedForAnnotation =
    useRecoilValue(selectedLabelForAnnotationAtom)?._id === label._id;
  const setCurrent3dAnnotationMode = useSetRecoilState(
    current3dAnnotationModeAtom
  );

  useEffect(() => {
    if (isSelectedForAnnotation) {
      setCurrent3dAnnotationMode("cuboid");
    }
  }, [isSelectedForAnnotation, setCurrent3dAnnotationMode]);

  const labelWoQuaternion = useMemo(() => {
    if (!label.quaternion) {
      return label;
    }
    const { quaternion, ...rest } = label;
    return rest;
  }, [label]);

  const { onPointerOver, onPointerOut, ...restEventHandlers } =
    useEventHandlers(tooltip, labelWoQuaternion);

  const { strokeAndFillColor, isSimilarLabelHovered } = useLabelColor(
    { selected, color },
    isHovered,
    label,
    isSelectedForAnnotation
  );

  const {
    transformControlsRef,
    contentRef,
    effectiveLocation,
    effectiveDimensions,
    effectiveRotation,
    effectiveQuaternion,
    handleTransformChange,
    handleTransformEnd,
  } = useCuboidAnnotation({
    label,
    location,
    dimensions,
    rotation,
    strokeAndFillColor,
    isAnnotateMode,
    isSelectedForAnnotation,
  });

  const transformMode = useRecoilValue(transformModeAtom);

  // Transient state for live drag preview
  const transientState = useTransientCuboid(label._id);

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
    let [x, y, z] = effectiveLocation;

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
    return [x, y, z] as const;
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
  }, [
    transientState?.quaternionOverride,
    effectiveQuaternion,
    rotation,
    transformMode,
  ]);

  // Fallback to euler-based rotation when no quaternion available
  const fallbackEuler = useMemo(() => {
    if (combinedQuaternion) {
      return undefined;
    }
    return effectiveRotation;
  }, [combinedQuaternion, effectiveRotation]);

  const renderBoxGeometry = useMemo(
    () => displayDimensions && new THREE.BoxGeometry(...displayDimensions),
    [displayDimensions]
  );

  const renderEdgesGeometry = useMemo(
    () => new THREE.EdgesGeometry(renderBoxGeometry),
    [renderBoxGeometry]
  );
  const lineSegmentsGeometry = useMemo(
    () =>
      new LineSegmentsGeometry().fromLineSegments(
        new THREE.LineSegments(renderEdgesGeometry)
      ),
    [renderEdgesGeometry]
  );

  const complementaryColor = useMemo(
    () => chroma(strokeAndFillColor).set("hsl.h", "+180").hex(),
    [strokeAndFillColor]
  );

  const material = useMemo(
    () =>
      new LineMaterial({
        opacity: opacity,
        transparent: opacity < 0.2,
        color: strokeAndFillColor,
        linewidth: lineWidth,
      }),
    [
      selected,
      lineWidth,
      opacity,
      isHovered,
      isSimilarLabelHovered,
      strokeAndFillColor,
    ]
  );

  // This effect cleans up geometries and material on unmount
  useEffect(() => {
    return () => {
      renderBoxGeometry.dispose();
      renderEdgesGeometry.dispose();
      lineSegmentsGeometry.dispose();
      material.dispose();
    };
  }, [renderBoxGeometry, renderEdgesGeometry, lineSegmentsGeometry, material]);

  if (!location || !dimensions) return null;

  /**
   * note: it's important to not set event handlers on the group,
   * because raycasting for line2 is unstable.
   * so we skip the border and only use the volume instead, which is more stable.
   *
   * we're using line2 over core line because line2 allows configurable line width
   */
  const content = (
    <group
      // By default, quaternion is preferred automatically over euler
      ref={contentRef}
      userData={{ labelId: label._id }}
      rotation={combinedQuaternion ? undefined : fallbackEuler ?? undefined}
      quaternion={combinedQuaternion ?? undefined}
      position={displayPosition}
    >
      {/* Outline */}
      {/* @ts-ignore */}
      <lineSegments2 geometry={lineSegmentsGeometry} material={material} />

      {/* Clickable volume */}
      <group
        onClick={onClick}
        onPointerOver={() => {
          setHoveredLabel({ id: label._id });
          onPointerOver();
        }}
        onPointerOut={() => {
          setHoveredLabel(null);
          onPointerOut();
        }}
        {...restEventHandlers}
      >
        <mesh>
          <boxGeometry args={displayDimensions} />
          <meshBasicMaterial
            transparent={isSimilarLabelHovered ? false : true}
            opacity={isSimilarLabelHovered ? 0.95 : opacity * 0.5}
            color={strokeAndFillColor}
          />
        </mesh>

        {isSelectedForAnnotation && (
          <mesh>
            <boxGeometry args={displayDimensions} />
            <meshBasicMaterial wireframe color={complementaryColor} />
          </mesh>
        )}
      </group>
    </group>
  );

  return (
    <Transformable
      archetype="cuboid"
      isSelectedForTransform={isSelectedForAnnotation}
      transformControlsRef={transformControlsRef}
      onTransformEnd={handleTransformEnd}
      onTransformChange={handleTransformChange}
      explicitObjectRef={contentRef}
    >
      {content}
    </Transformable>
  );
};
