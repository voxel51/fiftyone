import { useCallback, useEffect, useRef } from "react";
import { useRecoilState, useSetRecoilState } from "recoil";
import {
  clearTransformStateSelector,
  isTransformingAtom,
  selectedLabelForTransformAtom,
  transformModeAtom,
  transformSpaceAtom,
  type TransformMode,
  type TransformSpace,
} from "../state";
import type { OverlayLabel } from "./loader";

/**
 * This hook is used to handle transform controls for 3D labels.
 */
export const useTransformControls = () => {
  const [selectedLabelForTransform, setSelectedLabelForTransform] =
    useRecoilState(selectedLabelForTransformAtom);
  const [transformMode, setTransformMode] = useRecoilState(transformModeAtom);
  const [transformSpace, setTransformSpace] =
    useRecoilState(transformSpaceAtom);
  const [isTransforming, setIsTransforming] =
    useRecoilState(isTransformingAtom);
  const clearTransformState = useSetRecoilState(clearTransformStateSelector);

  const transformControlsRef = useRef<any>(null);
  const lastKeyPressRef = useRef<{ key: string; time: number }>({
    key: "",
    time: 0,
  });

  const selectLabelForTransform = useCallback(
    (label: OverlayLabel) => {
      setSelectedLabelForTransform(label);
      setTransformMode("translate");
      setTransformSpace("world");
    },
    [setSelectedLabelForTransform, setTransformMode, setTransformSpace]
  );

  const clearSelectedLabel = useCallback(() => {
    setSelectedLabelForTransform(null);
    setIsTransforming(false);
  }, [setSelectedLabelForTransform, setIsTransforming]);

  const toggleLabelSelection = useCallback(
    (label: OverlayLabel) => {
      if (selectedLabelForTransform) {
        clearSelectedLabel();
      } else {
        selectLabelForTransform(label);
      }
    },
    [selectedLabelForTransform, clearSelectedLabel, selectLabelForTransform]
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
  }, [setIsTransforming]);

  const handleTransformEnd = useCallback(() => {
    setIsTransforming(false);
  }, [setIsTransforming]);

  /**
   * This effect handles keyboard events for transform controls.
   * It listens for keydown events and handles the following:
   * - Mode switching (G, R, S)
   * - Axis constraints (X, Y, Z for world, XX, YY, ZZ for local)
   * - ESC to deselect
   *
   * Note: these hotkeys are inspired by Blender.
   */
  useEffect(() => {
    if (!selectedLabelForTransform) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle hotkeys when a label is selected for transform
      if (!selectedLabelForTransform) return;

      // Prevent default behavior for our hotkeys
      const hotkeys = ["g", "r", "s", "x", "y", "z"];
      if (hotkeys.includes(e.key.toLowerCase())) {
        e.preventDefault();
        e.stopPropagation();
      }

      const key = e.key.toLowerCase();

      // Mode switching (G, R, S)
      if (key === "g") {
        setMode("translate");
      } else if (key === "r") {
        setMode("rotate");
      } else if (key === "s") {
        setMode("scale");
      }

      // Axis constraints (X, Y, Z for world, XX, YY, ZZ for local)
      if (key === "x" || key === "y" || key === "z") {
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

      // ESC to deselect
      if (key === "escape") {
        clearTransformState(null);
        e.stopPropagation();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedLabelForTransform, setMode, setSpace, clearSelectedLabel]);

  return {
    selectedLabelForTransform,
    selectLabelForTransform,
    toggleLabelSelection,
    clearSelectedLabel,
    transformMode,
    transformSpace,
    isTransforming,
    setMode,
    setSpace,
    handleTransformStart,
    handleTransformEnd,
    transformControlsRef,
  };
};
