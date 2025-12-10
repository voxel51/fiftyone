import * as fos from "@fiftyone/state";
import { extend } from "@react-three/fiber";
import { useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry";
import { useCuboidAnnotation } from "../annotation/useCuboidAnnotation";
import {
  hoveredLabelAtom,
  isCuboidAnnotateActiveAtom,
  selectedLabelForAnnotationAtom,
  tempLabelTransformsAtom,
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
  const setIsCuboidAnnotateActive = useSetRecoilState(
    isCuboidAnnotateActiveAtom
  );

  useEffect(() => {
    if (isSelectedForAnnotation) {
      setIsCuboidAnnotateActive(true);
    }
  }, [isSelectedForAnnotation, setIsCuboidAnnotateActive]);

  const { onPointerOver, onPointerOut, ...restEventHandlers } =
    useEventHandlers(tooltip, label);

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
    handleTransformChange,
    handleTransformEnd,
  } = useCuboidAnnotation({
    label,
    location,
    dimensions,
    itemRotation,
    strokeAndFillColor,
    isAnnotateMode,
    isSelectedForAnnotation,
  });

  const tempTransforms = useRecoilValue(tempLabelTransformsAtom(label._id));

  // Use transient dimensions during scaling, otherwise use effective dimensions
  const displayDimensions = tempTransforms?.dimensions ?? effectiveDimensions;

  const geo = useMemo(
    () => displayDimensions && new THREE.BoxGeometry(...displayDimensions),
    [displayDimensions]
  );

  // In legacy coordinate system, location was stored as the top-center of the cuboid
  // (half-height above the geometric center), so we adjust Y downward by half the height
  // to position the cuboid correctly. In the new coordinate system, location is stored
  // as the geometric center, matching Three.js BoxGeometry's center, so no adjustment is needed.
  const loc = useMemo(() => {
    const [x, y, z] = effectiveLocation;
    return useLegacyCoordinates
      ? new THREE.Vector3(x, y - 0.5 * displayDimensions[1], z)
      : new THREE.Vector3(x, y, z);
  }, [effectiveLocation, displayDimensions, useLegacyCoordinates]);

  // Combine scene rotation with item rotation
  const actualRotation = useMemo(() => {
    const itemRotationVec = new THREE.Vector3(...effectiveRotation);
    const resolvedRotation = new THREE.Vector3(...rotation);
    return resolvedRotation.clone().add(itemRotationVec).toArray();
  }, [effectiveRotation, rotation]);

  const edgesGeo = useMemo(() => new THREE.EdgesGeometry(geo), [geo]);
  const geometry = useMemo(
    () =>
      new LineSegmentsGeometry().fromLineSegments(
        new THREE.LineSegments(edgesGeo)
      ),
    [edgesGeo]
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

  // Cleanup
  useEffect(() => {
    return () => {
      geo.dispose();
      edgesGeo.dispose();
      geometry.dispose();
      material.dispose();
    };
  }, [geo, edgesGeo, geometry, material]);

  if (!location || !dimensions) return null;

  /**
   * note: it's important to not set event handlers on the group,
   * because raycasting for line2 is unstable.
   * so we skip the border and only use the volume instead, which is more stable.
   *
   * we're using line2 over core line because line2 allows configurable line width
   */
  const content = (
    <>
      {/* Outline */}
      {/* @ts-ignore */}
      <lineSegments2
        position={[loc.x, loc.y, loc.z]}
        rotation={actualRotation}
        geometry={geometry}
        material={material}
      />

      {/* Clickable volume */}
      <mesh
        position={[loc.x, loc.y, loc.z]}
        rotation={actualRotation}
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
        <boxGeometry args={displayDimensions} />
        <meshBasicMaterial
          transparent={isSimilarLabelHovered ? false : true}
          opacity={isSimilarLabelHovered ? 0.95 : opacity * 0.5}
          color={strokeAndFillColor}
        />
      </mesh>
    </>
  );

  return (
    <Transformable
      archetype="cuboid"
      isSelectedForTransform={isSelectedForAnnotation}
      transformControlsPosition={location as THREE.Vector3Tuple}
      transformControlsRef={transformControlsRef}
      onTransformEnd={handleTransformEnd}
      onTransformChange={handleTransformChange}
      explicitObjectRef={contentRef}
    >
      <group
        userData={{ labelId: label._id }}
        ref={contentRef}
        // Note that tempTransforms?.position is relative offset (delta) for cuboids.
        position={tempTransforms?.position ?? [0, 0, 0]}
      >
        {content}
      </group>
    </Transformable>
  );
};
