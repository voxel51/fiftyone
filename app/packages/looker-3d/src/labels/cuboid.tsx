import { extend } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { useSetRecoilState } from "recoil";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry";
import { hoveredLabelAtom } from "../state";
import type { OverlayProps } from "./shared";
import { TransformControlsWrapper } from "./shared/TransformControls";
import {
  useEventHandlers,
  useHoverState,
  useLabelColor,
  useTransformHandlers,
} from "./shared/hooks";

extend({ LineSegments2, LineMaterial, LineSegmentsGeometry });

export interface CuboidProps extends OverlayProps {
  location: THREE.Vector3Tuple;
  dimensions: THREE.Vector3Tuple;
  itemRotation: THREE.Vector3Tuple;
  lineWidth?: number;
  isSelectedForAnnotation?: boolean;
  isSelectedForTransform?: boolean;
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
  isSelectedForAnnotation,
  isSelectedForTransform,
  isAnnotateMode,
  transformMode = "translate",
  transformSpace = "world",
  onTransformStart,
  onTransformEnd,
  onTransformChange,
  transformControlsRef,
}: CuboidProps) => {
  const geo = useMemo(
    () => dimensions && new THREE.BoxGeometry(...dimensions),
    [dimensions]
  );

  // @todo: add comment to add more context on what legacy coordinates means
  const loc = useMemo(() => {
    const [x, y, z] = location;
    return useLegacyCoordinates
      ? new THREE.Vector3(x, y - 0.5 * dimensions[1], z)
      : new THREE.Vector3(x, y, z);
  }, [location, dimensions, useLegacyCoordinates]);

  const itemRotationVec = useMemo(
    () => new THREE.Vector3(...itemRotation),
    [itemRotation]
  );
  const resolvedRotation = useMemo(
    () => new THREE.Vector3(...rotation),
    [rotation]
  );
  const actualRotation = useMemo(
    () => resolvedRotation.add(itemRotationVec).toArray(),
    [resolvedRotation, itemRotationVec]
  );

  const { isHovered, setIsHovered } = useHoverState();
  const { onPointerOver, onPointerOut, restEventHandlers } = useEventHandlers(
    tooltip,
    label
  );
  const { strokeAndFillColor, isSimilarLabelHovered } = useLabelColor(
    { selected, color },
    isHovered,
    label,
    isSelectedForAnnotation
  );
  const { handleTransformStart, handleTransformEnd } = useTransformHandlers(
    label,
    onTransformStart,
    onTransformEnd
  );
  const setHoveredLabel = useSetRecoilState(hoveredLabelAtom);

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
        transparent: false,
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

  return (
    <TransformControlsWrapper
      isSelectedForTransform={isSelectedForTransform}
      isAnnotateMode={isAnnotateMode}
      transformMode={transformMode}
      transformSpace={transformSpace}
      onTransformStart={handleTransformStart}
      onTransformEnd={handleTransformEnd}
      onTransformChange={onTransformChange}
      transformControlsRef={transformControlsRef}
      transformControlsPosition={[loc.x, loc.y, loc.z]}
    >
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
        {...restEventHandlers}
      >
        <boxGeometry args={dimensions} />
        <meshBasicMaterial
          transparent={isSimilarLabelHovered ? false : true}
          opacity={isSimilarLabelHovered ? 0.95 : opacity * 0.5}
          color={strokeAndFillColor}
        />
      </mesh>
    </TransformControlsWrapper>
  );
};
