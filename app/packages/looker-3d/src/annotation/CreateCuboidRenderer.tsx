import { useAnnotationEventBus } from "@fiftyone/annotation";
import { DETECTION, objectId } from "@fiftyone/utilities";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import * as THREE from "three";
import { useEmptyCanvasInteraction } from "../hooks/use-empty-canvas-interaction";
import { useScenePointClouds } from "../hooks/use-scene-point-clouds";
import { useSelect3DLabelForAnnotation } from "../hooks/useSelect3DLabelForAnnotation";
import type { CuboidCreationState } from "../types";
import {
  annotationPlaneAtom,
  continuousCuboidCreationAtom,
  cuboidCreationStateAtom,
  currentActiveAnnotationField3dAtom,
  isCreatingCuboidAtom,
  isCreatingCuboidPointerDownAtom,
  useCuboidTransformCommands,
} from "../state";
import { getPlaneFromPositionAndQuaternion } from "../utils";
import { getCuboidCreationPreview } from "./cuboid-creation-preview";
import { fitCuboidHeightToPoints } from "./fit-cuboid-to-points";
import { useCuboidOperations } from "./store/operations";
import {
  getDefaultLabel,
  recordLastCreatedLabel,
} from "./store/labelResolution";
import { workingDocSelector } from "./store/working";
import type { CuboidTransformData } from "./types";
import { useSetEditingToNewCuboid } from "./useSetEditingToNewCuboid";

interface CreateCuboidRendererProps {
  color?: string;
  ignoreEffects?: boolean;
}

const createInitialCuboidCreationState = (): CuboidCreationState => ({
  step: 0,
  centerPosition: null,
  orientationPoint: null,
  currentPosition: null,
});

export const CreateCuboidRenderer = ({
  color = "#00ff00",
  ignoreEffects = false,
}: CreateCuboidRendererProps) => {
  const currentActiveField = useRecoilValue(currentActiveAnnotationField3dAtom);
  const [isCreatingCuboid, setIsCreatingCuboid] =
    useRecoilState(isCreatingCuboidAtom);
  const selectForAnnotation = useSelect3DLabelForAnnotation();
  const { selectNewCuboidForTransform, setTransformMode } =
    useCuboidTransformCommands();
  const { createCuboid } = useCuboidOperations();
  const continuousCreation = useRecoilValue(continuousCuboidCreationAtom);
  const annotationPlane = useRecoilValue(annotationPlaneAtom);
  const [creationState, setCreationState] = useRecoilState(
    cuboidCreationStateAtom,
  );
  const setIsCreatingCuboidPointerDown = useSetRecoilState(
    isCreatingCuboidPointerDownAtom,
  );

  const setEditingToNewCuboid = useSetEditingToNewCuboid();
  const workingDoc = useRecoilValue(workingDocSelector);
  const getScenePointClouds = useScenePointClouds();

  const annotationEventBus = useAnnotationEventBus();

  // Track whether we're actively creating (to differentiate from hovering)
  const isActiveRef = useRef(false);

  const resetCuboidCreation = useCallback(() => {
    isActiveRef.current = false;
    setIsCreatingCuboidPointerDown(false);
    setCreationState(createInitialCuboidCreationState());
  }, [setCreationState, setIsCreatingCuboidPointerDown]);

  // Calculate the annotation plane for raycasting
  const raycastPlane = useMemo(() => {
    const plane = getPlaneFromPositionAndQuaternion(
      annotationPlane.position,
      annotationPlane.quaternion,
    );

    return {
      normal: plane.normal,
      constant: -plane.constant,
    };
  }, [annotationPlane.position, annotationPlane.quaternion]);

  // Calculate preview cuboid properties based on creation state
  const previewCuboid = useMemo(
    () => getCuboidCreationPreview(creationState, annotationPlane),
    [creationState, annotationPlane],
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
    ],
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
    [isCreatingCuboid, creationState.step, setCreationState],
  );

  // Handle final click (step 2) - commit the cuboid
  const handlePointerUp = useCallback(
    (intersectionPoint: THREE.Vector3) => {
      if (!isCreatingCuboid || !currentActiveField) return;

      if (creationState.step === 2 && previewCuboid) {
        const labelId = objectId();

        // The gesture sets the footprint (length/width) and orientation but not
        // the height. Derive the height and vertical center from the point-cloud
        // points inside that footprint so the box wraps the object instead of
        // using a placeholder height that forces a manual resize afterwards.
        const fittedCuboid = fitCuboidHeightToPoints(
          previewCuboid,
          getScenePointClouds(),
        );

        const location: THREE.Vector3Tuple = [
          Number(fittedCuboid.location[0].toFixed(7)),
          Number(fittedCuboid.location[1].toFixed(7)),
          Number(fittedCuboid.location[2].toFixed(7)),
        ];

        const dimensions: THREE.Vector3Tuple = [
          Number(fittedCuboid.dimensions[0].toFixed(7)),
          Number(fittedCuboid.dimensions[1].toFixed(7)),
          Number(fittedCuboid.dimensions[2].toFixed(7)),
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

        recordLastCreatedLabel(currentActiveField, labelClass);

        if (continuousCreation) {
          // Stay in create mode so the user can place the next cuboid
          // back-to-back. The new cuboid is committed to the working store but
          // not selected for editing; Escape (or toggling the create button)
          // exits create mode.
          resetCuboidCreation();
        } else {
          // Select the freshly created cuboid and drop into edit mode so the
          // user can immediately fine-tune it, then exit create mode.
          setEditingToNewCuboid(labelId, transformData, labelClass);

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
          selectNewCuboidForTransform();
          setTransformMode("scale");

          setIsCreatingCuboid(false);

          resetCuboidCreation();
        }
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
      continuousCreation,
      getScenePointClouds,
      createCuboid,
      selectForAnnotation,
      handleClick,
      selectNewCuboidForTransform,
      setEditingToNewCuboid,
      setIsCreatingCuboid,
      setTransformMode,
      resetCuboidCreation,
      workingDoc,
    ],
  );

  // Reset creation state when create mode is disabled
  useEffect(() => {
    if (ignoreEffects) return;

    if (!isCreatingCuboid) {
      resetCuboidCreation();
    }
  }, [ignoreEffects, isCreatingCuboid, resetCuboidCreation]);

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

  // Handle Escape key before the modal-level binding closes the modal.
  useEffect(() => {
    if (ignoreEffects) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isCreatingCuboid) return;

      if (event.key === "Escape") {
        setIsCreatingCuboid(false);
        resetCuboidCreation();

        event.stopImmediatePropagation();
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      document.removeEventListener("keydown", handleKeyDown, {
        capture: true,
      });
  }, [
    ignoreEffects,
    isCreatingCuboid,
    resetCuboidCreation,
    setIsCreatingCuboid,
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
