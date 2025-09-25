import { useCallback, useEffect, useRef } from "react";
import { useRecoilState, useSetRecoilState } from "recoil";
import {
  clearTransformStateSelector,
  isInTransformModeAtom,
  isTransformingAtom,
  selectedLabelForAnnotationAtom,
  transformDataAtom,
  transformedLabelsAtom,
  transformModeAtom,
  transformSpaceAtom,
  type TransformData,
  type TransformedLabelData,
  type TransformMode,
  type TransformSpace,
} from "../state";
import type { OverlayLabel } from "./loader";

/**
 * This hook is used to handle annotation controls for 3D labels.
 */
export const useAnnotationControls = () => {
  const [selectedLabelForAnnotation, setSelectedLabelForAnnotation] =
    useRecoilState(selectedLabelForAnnotationAtom);
  const [isInTransformMode, setIsInTransformMode] = useRecoilState(
    isInTransformModeAtom
  );
  const [transformMode, setTransformMode] = useRecoilState(transformModeAtom);
  const [transformSpace, setTransformSpace] =
    useRecoilState(transformSpaceAtom);
  const [isTransforming, setIsTransforming] =
    useRecoilState(isTransformingAtom);
  const setTransformData = useSetRecoilState(transformDataAtom);
  const [transformedLabels, setTransformedLabels] = useRecoilState(
    transformedLabelsAtom
  );
  const clearTransformState = useSetRecoilState(clearTransformStateSelector);

  const transformControlsRef = useRef<any>(null);
  const lastKeyPressRef = useRef<{ key: string; time: number }>({
    key: "",
    time: 0,
  });

  const originalValuesRef = useRef<{
    position: [number, number, number];
    dimensions: [number, number, number];
  } | null>(null);

  const selectLabelForAnnotation = useCallback(
    (label: OverlayLabel) => {
      setSelectedLabelForAnnotation(label);
    },
    [setSelectedLabelForAnnotation]
  );

  const enterTransformMode = useCallback(() => {
    if (selectedLabelForAnnotation) {
      setIsInTransformMode(true);
      setTransformMode("translate");
      setTransformSpace("world");
    }
  }, [
    selectedLabelForAnnotation,
    setIsInTransformMode,
    setTransformMode,
    setTransformSpace,
  ]);

  const exitTransformMode = useCallback(() => {
    setIsInTransformMode(false);
    setIsTransforming(false);
    setTransformData({});
  }, [setIsInTransformMode, setIsTransforming, setTransformData]);

  const clearSelectedLabel = useCallback(() => {
    setSelectedLabelForAnnotation(null);
    setIsInTransformMode(false);
    setIsTransforming(false);
  }, [setSelectedLabelForAnnotation, setIsInTransformMode, setIsTransforming]);

  const toggleLabelSelection = useCallback(
    (label: OverlayLabel) => {
      if (selectedLabelForAnnotation) {
        clearSelectedLabel();
      } else {
        selectLabelForAnnotation(label);
      }
    },
    [selectedLabelForAnnotation, clearSelectedLabel, selectLabelForAnnotation]
  );

  const setMode = useCallback(
    (mode: TransformMode) => {
      setTransformMode(mode);
    },
    [setTransformMode]
  );

  const setSpace = useCallback(
    (space: TransformSpace) => {
      setTransformSpace(space);
    },
    [setTransformSpace]
  );

  const handleTransformStart = useCallback(() => {
    setIsTransforming(true);
    // Reset transform data when transformation starts
    setTransformData({});

    // Store original values for delta calculation
    if (selectedLabelForAnnotation && isInTransformMode) {
      const labelId = selectedLabelForAnnotation._id;
      const existingTransform = transformedLabels[labelId];
      const labelWithProps = selectedLabelForAnnotation as any;

      originalValuesRef.current = {
        position: existingTransform?.worldPosition ||
          labelWithProps.location || [0, 0, 0],
        dimensions: existingTransform?.dimensions ||
          labelWithProps.dimensions || [1, 1, 1],
      };
    }
  }, [
    setIsTransforming,
    setTransformData,
    selectedLabelForAnnotation,
    isInTransformMode,
    transformedLabels,
  ]);

  const handleTransformEnd = useCallback(() => {
    setIsTransforming(false);
    // Reset transform data when transformation ends
    setTransformData({});

    // Save the final transformed values
    if (
      transformControlsRef.current &&
      selectedLabelForAnnotation &&
      isInTransformMode &&
      originalValuesRef.current
    ) {
      const controls = transformControlsRef.current;
      const object = controls.object;
      const labelId = selectedLabelForAnnotation._id;

      if (object) {
        const newTransformedData: TransformedLabelData = {
          worldPosition: [
            object.position.x,
            object.position.y,
            object.position.z,
          ],
          dimensions:
            transformMode === "scale"
              ? [
                  originalValuesRef.current.dimensions[0] * object.scale.x,
                  originalValuesRef.current.dimensions[1] * object.scale.y,
                  originalValuesRef.current.dimensions[2] * object.scale.z,
                ]
              : transformedLabels[labelId]?.dimensions ||
                (selectedLabelForAnnotation as any).dimensions || [1, 1, 1],
          localRotation: [
            (object.rotation.x * 180) / Math.PI,
            (object.rotation.y * 180) / Math.PI,
            (object.rotation.z * 180) / Math.PI,
          ],
          worldRotation: [
            (object.rotation.x * 180) / Math.PI,
            (object.rotation.y * 180) / Math.PI,
            (object.rotation.z * 180) / Math.PI,
          ],
        };

        setTransformedLabels((prev) => ({
          ...prev,
          [labelId]: newTransformedData,
        }));
      }
    }

    originalValuesRef.current = null;
  }, [
    setIsTransforming,
    setTransformData,
    transformControlsRef,
    selectedLabelForAnnotation,
    isInTransformMode,
    transformMode,
    transformedLabels,
    setTransformedLabels,
  ]);

  const handleTransformChange = useCallback(() => {
    if (
      !transformControlsRef.current ||
      !selectedLabelForAnnotation ||
      !isInTransformMode ||
      !originalValuesRef.current
    )
      return;

    const controls = transformControlsRef.current;
    const object = controls.object;

    if (!object) return;

    const newTransformData: TransformData = {};

    // Store absolute world position
    newTransformData.x = object.position.x;
    newTransformData.y = object.position.y;
    newTransformData.z = object.position.z;

    switch (transformMode) {
      case "translate":
        // Show delta from original position
        const originalPos = originalValuesRef.current.position;
        newTransformData.dx = object.position.x - originalPos[0];
        newTransformData.dy = object.position.y - originalPos[1];
        newTransformData.dz = object.position.z - originalPos[2];
        break;

      case "scale":
        // Show absolute dimensions (original dimensions * scale)
        const originalDims = originalValuesRef.current.dimensions;
        newTransformData.dimensionX = originalDims[0] * object.scale.x;
        newTransformData.dimensionY = originalDims[1] * object.scale.y;
        newTransformData.dimensionZ = originalDims[2] * object.scale.z;
        break;

      case "rotate":
        // Absolute rotation in degrees (local rotation based on transformSpace setting)
        newTransformData.rotationX = (object.rotation.x * 180) / Math.PI;
        newTransformData.rotationY = (object.rotation.y * 180) / Math.PI;
        newTransformData.rotationZ = (object.rotation.z * 180) / Math.PI;
        break;
    }

    setTransformData(newTransformData);
  }, [
    transformMode,
    selectedLabelForAnnotation,
    isInTransformMode,
    setTransformData,
  ]);

  /**
   * This effect handles keyboard events for transform controls.
   * It listens for keydown events and handles the following:
   * - Mode switching (G, R, S) - only works when a label is selected for annotation
   * - Axis constraints (X, Y, Z for world, XX, YY, ZZ for local)
   * - ESC to deselect
   *
   * Note: these hotkeys are inspired by Blender.
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      // Mode switching (G, R, S) - only works when a label is selected for annotation
      if (
        (key === "g" || key === "r" || key === "s") &&
        selectedLabelForAnnotation
      ) {
        e.preventDefault();
        e.stopPropagation();

        // Enter transform mode if not already in it
        if (!isInTransformMode) {
          enterTransformMode();
        }

        // Set the appropriate transform mode
        if (key === "g") {
          setMode("translate");
        } else if (key === "r") {
          setMode("rotate");
        } else if (key === "s") {
          setMode("scale");
        }
      }

      // Axis constraints (X, Y, Z for world, XX, YY, ZZ for local) - only when in transform mode
      if ((key === "x" || key === "y" || key === "z") && isInTransformMode) {
        e.preventDefault();
        e.stopPropagation();

        const axis = key.toUpperCase();

        // Check if this is a double-tap for local space
        const now = Date.now();

        if (
          lastKeyPressRef.current.key === key &&
          now - lastKeyPressRef.current.time < 300
        ) {
          // Double tap - use local space
          setSpace("local");
          console.log(`Constrained to local ${axis} axis`);
        } else {
          // Single tap - use world space
          setSpace("world");
          console.log(`Constrained to world ${axis} axis`);
        }

        lastKeyPressRef.current = { key, time: now };
      }

      // ESC to exit transform mode (but keep annotation selection)
      if (key === "escape" && isInTransformMode) {
        exitTransformMode();
        e.stopPropagation();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    selectedLabelForAnnotation,
    isInTransformMode,
    enterTransformMode,
    exitTransformMode,
    setMode,
    setSpace,
  ]);

  return {
    selectedLabelForAnnotation,
    isInTransformMode,
    selectLabelForAnnotation,
    enterTransformMode,
    exitTransformMode,
    toggleLabelSelection,
    clearSelectedLabel,
    transformMode,
    transformSpace,
    isTransforming,
    setMode,
    setSpace,
    handleTransformStart,
    handleTransformEnd,
    handleTransformChange,
    transformControlsRef,
  };
};
