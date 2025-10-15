import { Line, useCursor } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import * as THREE from "three";
import { useFo3dContext } from "../fo3d/context";
import { Transformable } from "../labels/shared/TransformControls";
import {
  annotationPlaneAtom,
  currentArchetypeSelectedForTransformAtom,
  segmentPolylineStateAtom,
  transformModeAtom,
} from "../state";

interface AnnotationPlaneProps {
  showTransformControls?: boolean;
  viewType?: "top" | "bottom" | "right" | "left" | "front" | "back";
  panelType?: "side" | "main";
}

export const AnnotationPlane = ({
  showTransformControls = true,
  viewType = "top",
  panelType = "main",
}: AnnotationPlaneProps) => {
  const [annotationPlane, setAnnotationPlane] =
    useRecoilState(annotationPlaneAtom);

  const isSegmenting = useRecoilValue(segmentPolylineStateAtom).isActive;
  const transformMode = useRecoilValue(transformModeAtom);

  const [
    currentArchetypeSelectedForTransform,
    setCurrentArchetypeSelectedForTransform,
  ] = useRecoilState(currentArchetypeSelectedForTransformAtom);

  const isSelected =
    currentArchetypeSelectedForTransform === "annotation-plane";

  const { sceneBoundingBox, upVector } = useFo3dContext();
  const meshRef = useRef<THREE.Mesh>(null);
  const lineRef = useRef<any>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const transformControlsRef = useRef<any>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [dragStartPosition, setDragStartPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // When up vector changes, set isSelected and isEnabled to false
  useEffect(() => {
    setCurrentArchetypeSelectedForTransform(null);
    setAnnotationPlane((prev) => ({ ...prev, enabled: false }));
  }, [upVector]);

  // Calculate plane size based on scene bounding box
  const planeSize = useMemo(() => {
    if (!sceneBoundingBox) return 10;

    const size = sceneBoundingBox.getSize(new THREE.Vector3());

    if (upVector) {
      // Find the two dimensions that are most orthogonal to the up vector
      const upAbs = new THREE.Vector3(
        Math.abs(upVector.x),
        Math.abs(upVector.y),
        Math.abs(upVector.z)
      );

      // Get the two largest orthogonal dimensions
      const dimensions = [size.x, size.y, size.z];
      const orthogonalSizes = [];

      // Find dimensions where up vector component is smallest (most orthogonal)
      for (let i = 0; i < 3; i++) {
        if (upAbs.toArray()[i] < 0.5) {
          // Less than 0.5 means mostly orthogonal
          orthogonalSizes.push(Math.round(dimensions[i]));
        }
      }

      // If we found orthogonal dimensions, use 1.25x the max of those
      if (orthogonalSizes.length > 0) {
        return Math.max(...orthogonalSizes, 10) * 1.25;
      }
    }

    // Fallback: use 1.25x max of X and Y (assumes Z-up)
    return Math.max(size.x, 10, size.y) * 1.25;
  }, [sceneBoundingBox, upVector]);

  const position = useMemo(
    () => new THREE.Vector3(...annotationPlane.position),
    [annotationPlane]
  );
  const quaternion = useMemo(
    () => new THREE.Quaternion(...annotationPlane.quaternion),
    [annotationPlane]
  );

  // Determine which axes to show based on upVector and mode
  const transformControlsProps = useMemo(() => {
    // For rotate mode, always show all axes
    if (transformMode === "rotate") {
      return { showX: true, showY: true, showZ: true };
    }

    if (!upVector) {
      return { showX: true, showY: true, showZ: true };
    }

    // Find which axis is most aligned with the up vector
    const upAbs = new THREE.Vector3(
      Math.abs(upVector.x),
      Math.abs(upVector.y),
      Math.abs(upVector.z)
    );

    const maxComponent = Math.max(upAbs.x, upAbs.y, upAbs.z);

    // Determine which axis is the up axis
    const isXUp = Math.abs(upVector.x) === maxComponent;
    const isYUp = Math.abs(upVector.y) === maxComponent;
    const isZUp = Math.abs(upVector.z) === maxComponent;

    // For translate mode, only show the axis aligned with upVector
    return {
      showX: isXUp,
      showY: isYUp,
      showZ: isZUp,
    };
  }, [upVector, transformMode]);

  // This effect syncs the showX, showY, and showZ values with the transformControlsProps values
  useEffect(() => {
    if (!annotationPlane.enabled) return;

    setAnnotationPlane((prev) => ({
      ...prev,
      showX: transformControlsProps.showX,
      showY: transformControlsProps.showY,
      showZ: transformControlsProps.showZ,
    }));
  }, [transformControlsProps, annotationPlane.enabled, isSelected]);

  useCursor(
    isHovered && isSelected && !isSegmenting,
    "pointer",
    isSegmenting ? "crosshair" : "auto"
  );

  // Simple pulsing animation for scale and opacity for visibility
  useFrame((state) => {
    if (materialRef.current && meshRef.current && panelType === "main") {
      const time = state.clock.getElapsedTime();

      const baseOpacity = isSelected ? 0.2 : 0.08;
      const pulseOpacity = Math.sin(time * 2) * 0.05;
      materialRef.current.opacity = baseOpacity + pulseOpacity;

      const baseScale = 1;
      const pulseScale = Math.sin(time * 1.5) * 0.01;
      meshRef.current.scale.setScalar(baseScale + pulseScale);
    }
  });

  const handleMouseDown = useCallback((event: any) => {
    setIsMouseDown(true);
    setDragStartPosition({ x: event.clientX, y: event.clientY });
  }, []);

  const handleMouseMove = useCallback(
    (event: any) => {
      if (isMouseDown && dragStartPosition) {
        const deltaX = Math.abs(event.clientX - dragStartPosition.x);
        const deltaY = Math.abs(event.clientY - dragStartPosition.y);
        const threshold = 5; // pixels

        if (deltaX > threshold || deltaY > threshold) {
          setIsDragging(true);
        }
      }
    },
    [isMouseDown, dragStartPosition]
  );

  const handleMouseUp = useCallback(() => {
    setIsMouseDown(false);
    setDragStartPosition(null);
    // Reset dragging state after a short delay to allow click handlers to check it
    setTimeout(() => setIsDragging(false), 0);
  }, []);

  const handlePlaneClick = useCallback(
    (event: any) => {
      if (!showTransformControls || isSegmenting) return;

      event.stopPropagation();

      if (!isDragging) {
        setCurrentArchetypeSelectedForTransform((prev) =>
          prev === "annotation-plane" ? null : "annotation-plane"
        );
      }
    },
    [showTransformControls, isDragging, isSegmenting]
  );

  const handleTransformStart = useCallback(() => {
    setIsDragging(true);
  }, []);

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
  }, [syncAnnotationPlaneTransformation]);

  const handleTransformChange = useCallback(() => {
    syncAnnotationPlaneTransformation();
  }, [syncAnnotationPlaneTransformation]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isSelected) {
        setCurrentArchetypeSelectedForTransform(null);
        setIsDragging(false);
        event.stopPropagation();
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSelected]);

  if (!annotationPlane.enabled) {
    return null;
  }

  const shouldShowFullPlane =
    panelType === "main" ||
    (panelType === "side" && (viewType === "top" || viewType === "bottom"));

  if (showTransformControls && shouldShowFullPlane) {
    return (
      <Transformable
        archetype="annotation-plane"
        isSelectedForTransform={isSelected}
        onTransformStart={handleTransformStart}
        onTransformEnd={handleTransformEnd}
        onTransformChange={handleTransformChange}
        transformControlsRef={transformControlsRef}
        translationSnap={0.001}
        showX={transformControlsProps.showX}
        showY={transformControlsProps.showY}
        showZ={transformControlsProps.showZ}
        explicitObjectRef={meshRef}
      >
        <mesh
          ref={meshRef}
          position={position}
          quaternion={quaternion}
          onPointerOver={() => setIsHovered(true)}
          onPointerOut={() => setIsHovered(false)}
          onPointerDown={handleMouseDown}
          onPointerMove={handleMouseMove}
          onPointerUp={handleMouseUp}
          onClick={handlePlaneClick}
          renderOrder={1000}
        >
          <planeGeometry args={[planeSize, planeSize]} />
          <meshBasicMaterial
            ref={materialRef}
            color={isSelected ? "#ff6b35" : "#00bcd4"}
            transparent
            opacity={isSelected ? 0.2 : 0.08}
            side={THREE.DoubleSide}
          />
        </mesh>
      </Transformable>
    );
  } else {
    const halfSize = planeSize / 2;
    let points: [number, number, number][];

    if (viewType === "left" || viewType === "right") {
      points = [
        [0, -halfSize, 0],
        [0, halfSize, 0],
      ];
    } else {
      points = [
        [-halfSize, 0, 0],
        [halfSize, 0, 0],
      ];
    }

    return (
      <group
        position={position}
        quaternion={quaternion}
        onPointerOver={() => setIsHovered(true)}
        onPointerOut={() => setIsHovered(false)}
        onPointerDown={handleMouseDown}
        onPointerMove={handleMouseMove}
        onPointerUp={handleMouseUp}
        onClick={handlePlaneClick}
      >
        <Line
          ref={lineRef}
          points={points}
          color="orangered"
          lineWidth={2}
          transparent
          opacity={0.8}
          renderOrder={0}
        />
      </group>
    );
  }
};
