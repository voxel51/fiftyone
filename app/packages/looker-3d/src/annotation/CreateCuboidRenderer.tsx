import { useAnnotationEventBus } from "@fiftyone/annotation";
import { objectId } from "@fiftyone/utilities";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import * as THREE from "three";
import { useEmptyCanvasInteraction } from "../hooks/use-empty-canvas-interaction";
import {
  annotationPlaneAtom,
  cuboidCreationStateAtom,
  currentActiveAnnotationField3dAtom,
  isCreatingCuboidAtom,
  isCreatingCuboidPointerDownAtom,
  selectedLabelForAnnotationAtom,
  stagedCuboidTransformsAtom,
} from "../state";
import { getPlaneFromPositionAndQuaternion } from "../utils";
import { useSetEditingToNewCuboid } from "./useSetEditingToNewCuboid";

interface CreateCuboidRendererProps {
  color?: string;
  ignoreEffects?: boolean;
}

const MIN_DIMENSION = 0.1;

const DEFAULT_HEIGHT = 1;

export const CreateCuboidRenderer = ({
  color = "#00ff00",
  ignoreEffects = false,
}: CreateCuboidRendererProps) => {
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
  const [creationState, setCreationState] = useRecoilState(
    cuboidCreationStateAtom
  );
  const setIsCreatingCuboidPointerDown = useSetRecoilState(
    isCreatingCuboidPointerDownAtom
  );

  const setEditingToNewCuboid = useSetEditingToNewCuboid();

  const annotationEventBus = useAnnotationEventBus();

  // Track whether we're actively creating (to differentiate from hovering)
  const isActiveRef = useRef(false);

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

  // Calculate preview cuboid properties based on creation state
  const previewCuboid = useMemo(() => {
    const { step, centerPosition, orientationPoint, currentPosition } =
      creationState;

    if (!centerPosition || !currentPosition) {
      return null;
    }

    const center = new THREE.Vector3(...centerPosition);
    const current = new THREE.Vector3(...currentPosition);

    if (step === 1) {
      // Step 1: Show preview with orientation line from center to current position
      // Length is the distance from center to current, width is MIN_DIMENSION
      const directionVector = current.clone().sub(center);
      const length = Math.max(directionVector.length(), MIN_DIMENSION);

      // Calculate yaw rotation from direction vector (in plane's local space)
      const localDirection = new THREE.Vector2(
        directionVector.dot(planeAxes.localX),
        directionVector.dot(planeAxes.localY)
      );
      const yaw = Math.atan2(localDirection.y, localDirection.x);

      // Create rotation quaternion combining plane orientation with yaw
      const planeQuaternion = new THREE.Quaternion(
        ...annotationPlane.quaternion
      );
      const yawQuaternion = new THREE.Quaternion().setFromAxisAngle(
        planeAxes.normal,
        yaw
      );
      const finalQuaternion = yawQuaternion.multiply(planeQuaternion);

      // Position center at midpoint between center and current
      const cuboidCenter = center.clone().add(current).multiplyScalar(0.5);
      // Offset by half height along plane normal
      cuboidCenter.add(
        planeAxes.normal.clone().multiplyScalar(DEFAULT_HEIGHT / 2)
      );

      return {
        location: cuboidCenter.toArray() as THREE.Vector3Tuple,
        dimensions: [
          length,
          MIN_DIMENSION,
          DEFAULT_HEIGHT,
        ] as THREE.Vector3Tuple,
        quaternion: finalQuaternion.toArray() as [
          number,
          number,
          number,
          number
        ],
      };
    }

    if (step === 2 && orientationPoint) {
      // Step 2: Show preview with length fixed, width based on perpendicular distance
      // The orientation line (center -> orientationPoint) represents one bound/edge of the cuboid
      // The current mouse position sets the opposite bound for width
      const orientation = new THREE.Vector3(...orientationPoint);
      const directionVector = orientation.clone().sub(center);
      const length = Math.max(directionVector.length(), MIN_DIMENSION);

      // Calculate yaw rotation
      const localDirection = new THREE.Vector2(
        directionVector.dot(planeAxes.localX),
        directionVector.dot(planeAxes.localY)
      );
      const yaw = Math.atan2(localDirection.y, localDirection.x);

      // Create rotation quaternion
      const planeQuaternion = new THREE.Quaternion(
        ...annotationPlane.quaternion
      );
      const yawQuaternion = new THREE.Quaternion().setFromAxisAngle(
        planeAxes.normal,
        yaw
      );
      const finalQuaternion = yawQuaternion.multiply(planeQuaternion);

      // Calculate width as perpendicular distance from current position to the orientation line
      // This directly represents one bound to the other (no doubling needed)
      const centerToOrientation = directionVector.clone().normalize();
      const centerToCurrent = current.clone().sub(center);
      // Project centerToCurrent onto centerToOrientation
      const projection = centerToOrientation
        .clone()
        .multiplyScalar(centerToCurrent.dot(centerToOrientation));
      // Perpendicular component - this is the vector from the orientation line to current position
      const perpendicular = centerToCurrent.clone().sub(projection);
      const width = Math.max(perpendicular.length(), MIN_DIMENSION);

      // Position center at midpoint between center and orientation (along the length axis)
      const cuboidCenter = center.clone().add(orientation).multiplyScalar(0.5);
      // Offset by half width perpendicular to the orientation line (toward the current position)
      if (perpendicular.length() > 0.001) {
        const perpendicularDirection = perpendicular.clone().normalize();
        cuboidCenter.add(perpendicularDirection.multiplyScalar(width / 2));
      }
      // Offset by half height along plane normal
      cuboidCenter.add(
        planeAxes.normal.clone().multiplyScalar(DEFAULT_HEIGHT / 2)
      );

      return {
        location: cuboidCenter.toArray() as THREE.Vector3Tuple,
        dimensions: [length, width, DEFAULT_HEIGHT] as THREE.Vector3Tuple,
        quaternion: finalQuaternion.toArray() as [
          number,
          number,
          number,
          number
        ],
      };
    }

    return null;
  }, [creationState, planeAxes, annotationPlane.quaternion]);

  // Handle click - progress through creation steps
  const handleClick = useCallback(
    (worldPos: THREE.Vector3) => {
      if (!isCreatingCuboid || !currentActiveField) return;

      const position: [number, number, number] = [
        worldPos.x,
        worldPos.y,
        worldPos.z,
      ];

      // Handle side effects before state update based on current step
      if (creationState.step === 0) {
        isActiveRef.current = true;
        setIsCreatingCuboidPointerDown(true);
        // Dispatch event to focus side panel cameras on the creation location
        annotationEventBus.dispatch("annotation:cuboidCreationStarted", {
          position,
        });
      }

      setCreationState((prev) => {
        if (prev.step === 0) {
          // First click: set center position
          return {
            step: 1,
            centerPosition: position,
            orientationPoint: null,
            currentPosition: position,
          };
        }

        if (prev.step === 1) {
          // Second click: set orientation point
          return {
            ...prev,
            step: 2,
            orientationPoint: position,
            currentPosition: position,
          };
        }

        // Step 2 click is handled separately to commit the cuboid
        return prev;
      });
    },
    [
      isCreatingCuboid,
      currentActiveField,
      creationState.step,
      setCreationState,
      setIsCreatingCuboidPointerDown,
      annotationEventBus,
    ]
  );

  // Handle pointer move - update current position for preview
  const handlePointerMove = useCallback(
    (worldPos: THREE.Vector3) => {
      if (!isCreatingCuboid) return;
      if (creationState.step === 0) return; // No preview until first click

      const position: [number, number, number] = [
        worldPos.x,
        worldPos.y,
        worldPos.z,
      ];

      setCreationState((prev) => ({
        ...prev,
        currentPosition: position,
      }));
    },
    [isCreatingCuboid, creationState.step, setCreationState]
  );

  // Handle final click (step 2) - commit the cuboid
  const handlePointerUp = useCallback(
    (intersectionPoint: THREE.Vector3) => {
      if (!isCreatingCuboid || !currentActiveField) return;

      if (creationState.step === 2 && previewCuboid) {
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

        const transformData = {
          location,
          dimensions,
          quaternion,
        };

        // Add to staged transforms
        setStagedCuboidTransforms({
          [labelId]: transformData,
        });

        // Set editing to the new cuboid
        setEditingToNewCuboid(labelId, transformData);

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

        // Reset creation state
        isActiveRef.current = false;
        setIsCreatingCuboidPointerDown(false);
        setCreationState({
          step: 0,
          centerPosition: null,
          orientationPoint: null,
          currentPosition: null,
        });
      } else if (creationState.step < 2) {
        // Handle clicks for steps 0 and 1
        handleClick(intersectionPoint);
      }
    },
    [
      isCreatingCuboid,
      currentActiveField,
      creationState.step,
      previewCuboid,
      setStagedCuboidTransforms,
      setSelectedLabelForAnnotation,
      setIsCreatingCuboid,
      setIsCreatingCuboidPointerDown,
      setCreationState,
      setEditingToNewCuboid,
      handleClick,
    ]
  );

  // Reset creation state when create mode is disabled
  useEffect(() => {
    if (ignoreEffects) return;

    if (!isCreatingCuboid) {
      isActiveRef.current = false;
      setIsCreatingCuboidPointerDown(false);
      setCreationState({
        step: 0,
        centerPosition: null,
        orientationPoint: null,
        currentPosition: null,
      });
    }
  }, [
    ignoreEffects,
    isCreatingCuboid,
    setCreationState,
    setIsCreatingCuboidPointerDown,
  ]);

  // Set cursor to crosshair when in create mode
  useEffect(() => {
    if (ignoreEffects) return;

    if (isCreatingCuboid) {
      document.body.style.cursor = "crosshair";
      return () => {
        document.body.style.cursor = "default";
      };
    }
  }, [ignoreEffects, isCreatingCuboid]);

  // Handle Escape key to cancel cuboid creation
  useEffect(() => {
    if (ignoreEffects) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isCreatingCuboid || creationState.step === 0) return;

      if (event.key === "Escape") {
        // Reset creation state
        isActiveRef.current = false;
        setIsCreatingCuboidPointerDown(false);
        setCreationState({
          step: 0,
          centerPosition: null,
          orientationPoint: null,
          currentPosition: null,
        });

        event.stopImmediatePropagation();
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    ignoreEffects,
    isCreatingCuboid,
    creationState.step,
    setCreationState,
    setIsCreatingCuboidPointerDown,
  ]);

  useEmptyCanvasInteraction({
    onPointerMove:
      !ignoreEffects && isCreatingCuboid ? handlePointerMove : undefined,
    onPointerUp:
      !ignoreEffects && isCreatingCuboid ? handlePointerUp : undefined,
    planeNormal: raycastPlane.normal,
    planeConstant: raycastPlane.constant,
  });

  // Render preview cuboid
  if (!previewCuboid) {
    // Show center point indicator after first click
    if (creationState.step >= 1 && creationState.centerPosition) {
      const center = creationState.centerPosition;
      return (
        <mesh position={center}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshBasicMaterial color={color} />
        </mesh>
      );
    }
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
