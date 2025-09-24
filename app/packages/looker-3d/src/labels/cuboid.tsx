import { TransformControls, useCursor } from "@react-three/drei";
import { extend } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry";
import { use3dLabelColor } from "../hooks/use-3d-label-color";
import { useSimilarLabels3d } from "../hooks/use-similar-labels-3d";
import { TransformMode, TransformSpace } from "../state";
import type { OverlayProps } from "./shared";
extend({ LineSegments2, LineMaterial, LineSegmentsGeometry });

export interface CuboidProps extends OverlayProps {
  location: THREE.Vector3Tuple;
  dimensions: THREE.Vector3Tuple;
  itemRotation: THREE.Vector3Tuple;
  lineWidth?: number;
  isSelectedForTransform?: boolean;
  isAnnotateMode?: boolean;
  transformMode?: TransformMode;
  transformSpace?: TransformSpace;
  onTransformStart?: () => void;
  onTransformEnd?: () => void;
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
  isSelectedForTransform,
  isAnnotateMode,
  transformMode = "translate",
  transformSpace = "world",
  onTransformStart,
  onTransformEnd,
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

  const [isCuboidHovered, setIsCuboidHovered] = useState(false);

  const groupRef = useRef<THREE.Group>(null);
  useCursor(isCuboidHovered);

  const handleTransformEnd = useCallback(() => {
    onTransformEnd?.();
  }, [label._id, onTransformEnd]);

  const handleTransformStart = useCallback(() => {
    onTransformStart?.();
  }, [label._id, onTransformStart]);

  const edgesGeo = useMemo(() => new THREE.EdgesGeometry(geo), [geo]);
  const geometry = useMemo(
    () =>
      new LineSegmentsGeometry().fromLineSegments(
        new THREE.LineSegments(edgesGeo)
      ),
    [edgesGeo]
  );

  const isSimilarLabelHovered = useSimilarLabels3d(label);

  const strokeAndFillColor = use3dLabelColor({
    isSelected: selected,
    isHovered: isCuboidHovered,
    isSimilarLabelHovered,
    defaultColor: color,
  });

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
      isCuboidHovered,
      isSimilarLabelHovered,
      strokeAndFillColor,
    ]
  );

  const { onPointerOver, onPointerOut, ...restEventHandlers } = useMemo(() => {
    return {
      ...tooltip.getMeshProps(label),
    };
  }, [tooltip, label]);

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
    <>
      <group ref={groupRef}>
        {/* Outline */}
        <lineSegments2
          geometry={geometry}
          material={material}
          position={loc}
          rotation={actualRotation}
        />

        {/* Clickable volume */}
        <mesh
          position={loc}
          rotation={actualRotation}
          onClick={onClick}
          onPointerOver={() => {
            setIsCuboidHovered(true);
            onPointerOver();
          }}
          onPointerOut={() => {
            setIsCuboidHovered(false);
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
      </group>

      {/* TransformControls for annotate mode */}
      {isAnnotateMode && isSelectedForTransform && (
        <TransformControls
          object={groupRef}
          mode={transformMode}
          space={transformSpace}
          onMouseDown={handleTransformStart}
          onMouseUp={handleTransformEnd}
        />
      )}
    </>
  );
};
