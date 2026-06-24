import { useAnnotationEventBus } from "@fiftyone/annotation";
import { DETECTION, objectId } from "@fiftyone/utilities";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import * as THREE from "three";
import { useEmptyCanvasInteraction } from "../hooks/use-empty-canvas-interaction";
import { useSelect3DLabelForAnnotation } from "../hooks/useSelect3DLabelForAnnotation";
import {
  annotationPlaneAtom,
  cuboidCreationStateAtom,
  currentActiveAnnotationField3dAtom,
  currentArchetypeSelectedForTransformAtom,
  isCreatingCuboidAtom,
  isCreatingCuboidPointerDownAtom,
  transformModeAtom,
} from "../state";
import { getPlaneFromPositionAndQuaternion } from "../utils";
import { getCuboidCreationPreview } from "./cuboid-creation-preview";
import { useCuboidOperations } from "./store/operations";
import {
  getDefaultLabel,
  recordLastCreatedLabel,
} from "./store/labelResolution";
import { workingDocSelector } from "./store/working";
import { CuboidTransformData } from "./types";
import { useSetEditingToNewCuboid } from "./useSetEditingToNewCuboid";

interface CreateCuboidRendererProps {
  color?: string;
  ignoreEffects?: boolean;
}

export const CreateCuboidRenderer = ({
  color = "#00ff00",
  ignoreEffects = false,
}: CreateCuboidRendererProps) => {
  const currentActiveField = useRecoilValue(currentActiveAnnotationField3dAtom);
  const [isCreatingCuboid, setIsCreatingCuboid] =
    useRecoilState(isCreatingCuboidAtom);
  const selectForAnnotation = useSelect3DLabelForAnnotation();
  const setCurrentArchetypeSelectedForTransform = useSetRecoilState(
    currentArchetypeSelectedForTransformAtom
  );
  const setTransformMode = useSetRecoilState(transformModeAtom);
  const { createCuboid } = useCuboidOperations();
  const annotationPlane = useRecoilValue(annotationPlaneAtom);
  const [creationState, setCreationState] = useRecoilState(
    cuboidCreationStateAtom
  );
  const setIsCreatingCuboidPointerDown = useSetRecoilState(
    isCreatingCuboidPointerDownAtom
  );

  const setEditingToNewCuboid = useSetEditingToNewCuboid();
  const workingDoc = useRecoilValue(workingDocSelector);

  const annotationEventBus = useAnnotationEventBus();

  // Track whether we're actively creating (to differentiate from hovering)
  const isActiveRef = useRef(false);

  // Calculate the annotation plane for raycasting
  const raycastPlane = useMemo(() => {
    const plane = getPlaneFromPositionAndQuaternion(
      annotationPlane.position,
      annotationPlane.quaternion
    );

    return {
      normal: plane.normal,
      constant: -plane.constant,
    };
  }, [annotationPlane.position, annotationPlane.quaternion]);

  // Calculate preview cuboid properties based on creation state
  const previewCuboid = useMemo(
    () => getCuboidCreationPreview(creationState, annotationPlane),
    [creationState, annotationPlane]
  );

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

        const labelClass = getDefaultLabel(currentActiveField, workingDoc);

        const transformData: CuboidTransformData = {
          location,
          dimensions,
          quaternion,
        };

        createCuboid(labelId, transformData, currentActiveField, labelClass);

        setEditingToNewCuboid(labelId, transformData, labelClass);

        recordLastCreatedLabel(currentActiveField, labelClass);

        // selection flows through the engine anchor: use3dInteractionAdapter
        // attaches the transform controls + scene selection from one source
        selectForAnnotation({
          _id: labelId,
          path: currentActiveField,
          selected: true,
          _cls: DETECTION,
          location,
          dimensions,
          quaternion,
        });
        setCurrentArchetypeSelectedForTransform("cuboid");
        setTransformMode("scale");

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
      createCuboid,
      selectForAnnotation,
      handleClick,
      setCurrentArchetypeSelectedForTransform,
      setCreationState,
      setEditingToNewCuboid,
      setIsCreatingCuboid,
      setIsCreatingCuboidPointerDown,
      setTransformMode,
      workingDoc,
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
    if (ignoreEffects) return undefined;

    if (isCreatingCuboid) {
      document.body.style.cursor = "crosshair";
      return () => {
        document.body.style.cursor = "default";
      };
    }

    return undefined;
  }, [ignoreEffects, isCreatingCuboid]);

  // Handle Escape key to cancel cuboid creation
  useEffect(() => {
    if (ignoreEffects) return undefined;

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
