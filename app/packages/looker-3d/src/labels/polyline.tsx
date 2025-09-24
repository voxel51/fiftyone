import { TransformControls, useCursor } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { use3dLabelColor } from "../hooks/use-3d-label-color";
import { useSimilarLabels3d } from "../hooks/use-similar-labels-3d";
import { TransformMode, TransformSpace } from "../state";
import { Line } from "./line";
import { createFilledPolygonMeshes } from "./polygon-fill-utils";
import type { OverlayProps } from "./shared";

export interface PolyLineProps extends OverlayProps {
  points3d: THREE.Vector3Tuple[][];
  filled: boolean;
  lineWidth?: number;
  // We ignore closed for now
  closed?: boolean;
  isSelectedForTransform?: boolean;
  isAnnotateMode?: boolean;
  transformMode?: TransformMode;
  transformSpace?: TransformSpace;
  onTransformStart?: () => void;
  onTransformEnd?: () => void;
}

export const Polyline = ({
  opacity,
  filleds,
  rotation,
  points3d,
  color,
  selected,
  lineWidth,
  onClick,
  tooltip,
  label,
  isSelectedForTransform,
  isAnnotateMode,
  transformMode = "translate",
  transformSpace = "world",
  onTransformStart,
  onTransformEnd,
}: PolyLineProps) => {
  const filled = true;
  const groupRef = useRef<THREE.Group>(null);
  const meshesRef = useRef<THREE.Mesh[]>([]);

  const { onPointerOver, onPointerOut, ...restEventHandlers } = useMemo(() => {
    return {
      ...tooltip.getMeshProps(label),
    };
  }, [tooltip, label]);

  const [isPolylineHovered, setIsPolylineHovered] = useState(false);

  const isSimilarLabelHovered = useSimilarLabels3d(label);

  useCursor(isPolylineHovered);

  const handleTransformEnd = useCallback(() => {
    console.log("Transform ended for polyline:", label._id);
    onTransformEnd?.();
  }, [label._id, onTransformEnd]);

  const handleTransformStart = useCallback(() => {
    console.log("Transform started for polyline:", label._id);
    onTransformStart?.();
  }, [label._id, onTransformStart]);

  const strokeAndFillColor = use3dLabelColor({
    isSelected: selected,
    isHovered: isPolylineHovered,
    isSimilarLabelHovered,
    defaultColor: color,
  });

  const lines = useMemo(
    () =>
      points3d.map((pts, i) => (
        <Line
          key={`polyline-${label._id}-${i}`}
          width={lineWidth}
          rotation={rotation}
          points={pts}
          opacity={opacity}
          color={strokeAndFillColor}
          label={label}
        />
      )),
    [points3d, rotation, opacity, strokeAndFillColor, label, lineWidth]
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

    // dispose previous meshes
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

    const meshes = createFilledPolygonMeshes(points3d, material);
    meshesRef.current = meshes || [];

    if (!meshes) return null;

    return meshes.map((mesh, idx) => (
      <primitive
        key={`filled-${label._id}-${idx}`}
        object={mesh}
        rotation={rotation as unknown as THREE.Euler}
      />
    ));
  }, [filled, points3d, rotation, material, label._id]);

  // Cleanup meshes on unmount
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

  // Dispose material when it changes
  useEffect(() => {
    return () => {
      if (material) {
        material.dispose();
      }
    };
  }, [material]);

  if (filled && filledMeshes) {
    return (
      <>
        <group
          ref={groupRef}
          onPointerOver={() => {
            setIsPolylineHovered(true);
            onPointerOver();
          }}
          onPointerOut={() => {
            setIsPolylineHovered(false);
            onPointerOut();
          }}
          onClick={onClick}
          {...restEventHandlers}
        >
          {filledMeshes}
          {lines}
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
  }

  return (
    <>
      <group
        ref={groupRef}
        onPointerOver={() => {
          setIsPolylineHovered(true);
          onPointerOver();
        }}
        onPointerOut={() => {
          setIsPolylineHovered(false);
          onPointerOut();
        }}
        onClick={onClick}
        {...restEventHandlers}
      >
        {lines}
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
