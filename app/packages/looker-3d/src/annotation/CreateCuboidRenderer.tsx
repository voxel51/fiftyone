import * as fos from "@fiftyone/state";
import { objectId } from "@fiftyone/utilities";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import * as THREE from "three";
import { useFo3dContext } from "../fo3d/context";
import { useEmptyCanvasInteraction } from "../hooks/use-empty-canvas-interaction";
import {
  annotationPlaneAtom,
  cuboidCreationDragStateAtom,
  currentActiveAnnotationField3dAtom,
  isCreatingCuboidAtom,
  isCreatingCuboidPointerDownAtom,
  selectedLabelForAnnotationAtom,
  stagedCuboidTransformsAtom,
} from "../state";
import { getPlaneFromPositionAndQuaternion } from "../utils";

interface CreateCuboidRendererProps {
  color?: string;
}

const MIN_DIMENSION = 0.1;

export const CreateCuboidRenderer = ({
  color = "#00ff00",
}: CreateCuboidRendererProps) => {
  const currentSampleId = useRecoilValue(fos.currentSampleId);
  const currentActiveField = useRecoilValue(currentActiveAnnotationField3dAtom);
  const [isCreatingCuboid, setIsCreatingCuboid] =
    useRecoilState(isCreatingCuboidAtom);
  const setSelectedLabelForAnnotation = useSetRecoilState(
    selectedLabelForAnnotationAtom
  );
  const setStagedCuboidTransforms = useSetRecoilState(
    stagedCuboidTransformsAtom
  );
  const annotationPlane = useRecoilValue(annotationPlaneAtom);
  const [dragState, setDragState] = useRecoilState(cuboidCreationDragStateAtom);
  const setIsCreatingCuboidPointerDown = useSetRecoilState(
    isCreatingCuboidPointerDownAtom
  );

  // Track whether pointer is currently down (to differentiate move vs drag)
  const isPointerDownRef = useRef(false);

  const { sceneBoundingBox } = useFo3dContext();

  // Calculate depth as 10% of scene bounding box average dimension
  const defaultDepth = useMemo(() => {
    if (!sceneBoundingBox) return 1;
    const size = sceneBoundingBox.getSize(new THREE.Vector3());
    const avgDimension = (size.x + size.y + size.z) / 3;
    return avgDimension * 0.1;
  }, [sceneBoundingBox]);

  // Get the plane's local axes from its quaternion
  const planeAxes = useMemo(() => {
    const quaternion = new THREE.Quaternion(...annotationPlane.quaternion);
    const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
    const localY = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
    return { localX, localY, normal };
  }, [annotationPlane.quaternion]);

  // Calculate the annotation plane for raycasting
  const raycastPlane = useMemo(() => {
    const plane = getPlaneFromPositionAndQuaternion(
      annotationPlane.position,
      annotationPlane.quaternion
    );

    return {
      normal: plane.normal,
      constant: plane.constant,
    };
  }, [annotationPlane.position, annotationPlane.quaternion]);

  // Calculate preview cuboid properties during drag
  const previewCuboid = useMemo(() => {
    if (
      !dragState.isDragging ||
      !dragState.startPosition ||
      !dragState.currentPosition
    ) {
      return null;
    }

    const start = new THREE.Vector3(...dragState.startPosition);
    const current = new THREE.Vector3(...dragState.currentPosition);

    // Calculate drag vector
    const dragVector = current.clone().sub(start);

    // Project onto plane's local axes to get width and height
    const width = Math.abs(dragVector.dot(planeAxes.localX));
    const height = Math.abs(dragVector.dot(planeAxes.localY));

    // Ensure minimum dimensions
    const finalWidth = Math.max(width, MIN_DIMENSION);
    const finalHeight = Math.max(height, MIN_DIMENSION);

    // Calculate center position (midpoint of start and current)
    const center = start.clone().add(current).multiplyScalar(0.5);

    // Offset center by half depth along the plane normal (so cuboid sits on the plane)
    center.add(planeAxes.normal.clone().multiplyScalar(defaultDepth / 2));

    return {
      location: center.toArray() as THREE.Vector3Tuple,
      dimensions: [finalWidth, finalHeight, defaultDepth] as THREE.Vector3Tuple,
      quaternion: annotationPlane.quaternion as [
        number,
        number,
        number,
        number
      ],
    };
  }, [dragState, planeAxes, defaultDepth, annotationPlane.quaternion]);

  // Handle pointer down - mark that we're ready to start dragging
  const handlePointerDown = useCallback(() => {
    isPointerDownRef.current = true;
    setIsCreatingCuboidPointerDown(true);
  }, [setIsCreatingCuboidPointerDown]);

  // Handle pointer move - update drag state only if pointer is down
  const handlePointerMove = useCallback(
    (worldPos: THREE.Vector3) => {
      if (!isCreatingCuboid) return;
      // Only track drag if pointer is actually down (user clicked on canvas)
      if (!isPointerDownRef.current) return;

      const position: [number, number, number] = [
        worldPos.x,
        worldPos.y,
        worldPos.z,
      ];

      setDragState((prev) => {
        // If we don't have a start position yet, set it now (first move after click)
        if (!prev.startPosition) {
          return {
            isDragging: true,
            startPosition: position,
            currentPosition: position,
          };
        }

        // Update current position
        return {
          ...prev,
          isDragging: true,
          currentPosition: position,
        };
      });
    },
    [isCreatingCuboid, setDragState]
  );

  // Handle pointer up - commit the cuboid
  const handlePointerUp = useCallback(
    (intersectionPoint: THREE.Vector3) => {
      // Always reset pointer down state
      isPointerDownRef.current = false;
      setIsCreatingCuboidPointerDown(false);

      if (!isCreatingCuboid || !currentActiveField) return;

      // If we have a valid drag with dimensions, commit it
      if (dragState.isDragging && dragState.startPosition && previewCuboid) {
        const labelId = objectId();

        const location: THREE.Vector3Tuple = [
          Number(previewCuboid.location[0].toFixed(7)),
          Number(previewCuboid.location[1].toFixed(7)),
          Number(previewCuboid.location[2].toFixed(7)),
        ];

        const dimensions: THREE.Vector3Tuple = [
          Number(previewCuboid.dimensions[0].toFixed(7)),
          Number(previewCuboid.dimensions[1].toFixed(7)),
          Number(previewCuboid.dimensions[2].toFixed(7)),
        ];

        const quaternion: [number, number, number, number] = [
          Number(previewCuboid.quaternion[0].toFixed(7)),
          Number(previewCuboid.quaternion[1].toFixed(7)),
          Number(previewCuboid.quaternion[2].toFixed(7)),
          Number(previewCuboid.quaternion[3].toFixed(7)),
        ];

        // Add to staged transforms
        setStagedCuboidTransforms((prev) => ({
          ...prev,
          [labelId]: {
            location,
            dimensions,
            quaternion,
          },
        }));

        // Select the newly created cuboid
        setSelectedLabelForAnnotation({
          _id: labelId,
          _cls: "Detection",
          location,
          dimensions,
          quaternion,
        } as any);

        // Exit create mode after creating one cuboid
        setIsCreatingCuboid(false);
      }

      // Reset drag state
      setDragState({
        isDragging: false,
        startPosition: null,
        currentPosition: null,
      });
    },
    [
      isCreatingCuboid,
      currentActiveField,
      dragState,
      previewCuboid,
      setStagedCuboidTransforms,
      setSelectedLabelForAnnotation,
      setIsCreatingCuboid,
      setIsCreatingCuboidPointerDown,
      setDragState,
    ]
  );

  // Reset drag state when create mode is disabled
  useEffect(() => {
    if (!isCreatingCuboid) {
      isPointerDownRef.current = false;
      setIsCreatingCuboidPointerDown(false);
      setDragState({
        isDragging: false,
        startPosition: null,
        currentPosition: null,
      });
    }
  }, [isCreatingCuboid, setDragState, setIsCreatingCuboidPointerDown]);

  // Set cursor to crosshair when in create mode
  useEffect(() => {
    if (isCreatingCuboid) {
      document.body.style.cursor = "crosshair";
      return () => {
        document.body.style.cursor = "default";
      };
    }
  }, [isCreatingCuboid]);

  useEmptyCanvasInteraction({
    onPointerDown: isCreatingCuboid ? handlePointerDown : undefined,
    onPointerMove: isCreatingCuboid ? handlePointerMove : undefined,
    onPointerUp: isCreatingCuboid ? handlePointerUp : undefined,
    planeNormal: raycastPlane.normal,
    planeConstant: raycastPlane.constant,
  });

  // Render preview cuboid during drag
  if (!previewCuboid) {
    return null;
  }

  const { location, dimensions, quaternion } = previewCuboid;

  return (
    <group position={location} quaternion={quaternion}>
      {/* Wireframe preview */}
      <mesh>
        <boxGeometry args={dimensions} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.8} />
      </mesh>
      {/* Semi-transparent fill */}
      <mesh>
        <boxGeometry args={dimensions} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.2}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
};
