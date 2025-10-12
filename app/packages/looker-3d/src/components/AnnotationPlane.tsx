import { TransformControls, useCursor } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import * as THREE from "three";
import { useFo3dContext } from "../fo3d/context";
import {
  annotationPlaneAtom,
  isAnnotationPlaneTransformingAtom,
  segmentPolylineStateAtom,
} from "../state";

interface AnnotationPlaneProps {
  showTransformControls?: boolean;
}

export const AnnotationPlane = ({
  showTransformControls = true,
}: AnnotationPlaneProps) => {
  const [annotationPlane, setAnnotationPlane] =
    useRecoilState(annotationPlaneAtom);
  const setIsAnnotationPlaneTransforming = useSetRecoilState(
    isAnnotationPlaneTransformingAtom
  );
  const isSegmenting = useRecoilValue(segmentPolylineStateAtom).isActive;

  const { sceneBoundingBox } = useFo3dContext();
  const meshRef = useRef<THREE.Mesh>(null);
  const transformControlsRef = useRef<any>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isSelected, setIsSelected] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Calculate plane size based on scene bounding box
  const planeSize = useMemo(() => {
    if (!sceneBoundingBox) return 10;

    const size = sceneBoundingBox.getSize(new THREE.Vector3());
    // Use max of width/depth, minimum 10
    return Math.max(size.x, size.z, 10);
  }, [sceneBoundingBox]);

  const position = useMemo(
    () => new THREE.Vector3(...annotationPlane.position),
    [annotationPlane]
  );
  const quaternion = useMemo(
    () => new THREE.Quaternion(...annotationPlane.quaternion),
    [annotationPlane]
  );

  useCursor(
    isHovered && isSelected && !isSegmenting,
    "pointer",
    isSegmenting ? "crosshair" : "auto"
  );

  const handlePlaneClick = useCallback(
    (event: any) => {
      if (!showTransformControls || isSegmenting) return;

      event.stopPropagation();

      if (!isDragging) {
        setIsSelected(!isSelected);
      }
    },
    [showTransformControls, isSelected, isDragging, isSegmenting]
  );

  const handleTransformStart = useCallback(() => {
    setIsDragging(true);
    setIsAnnotationPlaneTransforming(true);
  }, [setIsAnnotationPlaneTransforming]);

  const syncAnnotationPlaneTransformation = useCallback(() => {
    if (transformControlsRef.current && meshRef.current) {
      const newPosition: [number, number, number] = [
        meshRef.current.position.x,
        meshRef.current.position.y,
        meshRef.current.position.z,
      ];

      const newQuaternion: [number, number, number, number] = [
        meshRef.current.quaternion.x,
        meshRef.current.quaternion.y,
        meshRef.current.quaternion.z,
        meshRef.current.quaternion.w,
      ];

      setAnnotationPlane((prev) => ({
        ...prev,
        position: newPosition,
        quaternion: newQuaternion,
      }));
    }
  }, []);

  const handleTransformEnd = useCallback(() => {
    syncAnnotationPlaneTransformation();
    setIsDragging(false);
    setIsAnnotationPlaneTransforming(false);
  }, [syncAnnotationPlaneTransformation]);

  const handleTransformChange = useCallback(() => {
    syncAnnotationPlaneTransformation();
  }, [syncAnnotationPlaneTransformation]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isSelected) {
        setIsSelected(false);
        setIsDragging(false);
        setIsAnnotationPlaneTransforming(false);
        event.stopPropagation();
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSelected, setIsAnnotationPlaneTransforming]);

  if (!annotationPlane.enabled) {
    return null;
  }

  if (showTransformControls) {
    return (
      <>
        <mesh
          ref={meshRef}
          position={position}
          quaternion={quaternion}
          onPointerOver={() => setIsHovered(true)}
          onPointerOut={() => setIsHovered(false)}
          onClick={handlePlaneClick}
          renderOrder={1000}
        >
          <planeGeometry args={[planeSize, planeSize]} />
          <meshBasicMaterial
            color={isSelected ? "#ff6b35" : "#00bcd4"}
            transparent
            opacity={isSelected ? 0.2 : 0.08}
            side={THREE.DoubleSide}
          />
        </mesh>
        {isSelected && (
          <TransformControls
            ref={transformControlsRef}
            object={meshRef}
            mode="translate"
            space="world"
            onMouseDown={handleTransformStart}
            onMouseUp={handleTransformEnd}
            onObjectChange={handleTransformChange}
          />
        )}
      </>
    );
  } else {
    // For side panels - render a thicker plane so it's visible from all angles
    // 2% of plane size for thickness
    const thickness = planeSize * 0.02;
    return (
      <group
        position={position}
        quaternion={quaternion}
        onClick={handlePlaneClick}
      >
        <mesh renderOrder={1000}>
          <boxGeometry args={[planeSize, planeSize, thickness]} />
          <meshBasicMaterial
            color="#00bcd4"
            transparent
            opacity={0.1}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    );
  }
};
