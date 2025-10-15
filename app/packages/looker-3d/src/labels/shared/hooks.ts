import { useCursor } from "@react-three/drei";
import { useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import { use3dLabelColor } from "../../hooks/use-3d-label-color";
import { useSimilarLabels3d } from "../../hooks/use-similar-labels-3d";
import { segmentPolylineStateAtom } from "../../state";
import type { BaseOverlayProps, EventHandlers, HoverState } from "../../types";

/**
 * Custom hook for managing hover state and cursor behavior
 */
export const useHoverState = (): HoverState => {
  const isSegmenting = useRecoilValue(segmentPolylineStateAtom).isActive;
  const [isHovered, setIsHovered] = useState(false);
  useCursor(
    isHovered,
    isSegmenting ? "crosshair" : "pointer",
    isSegmenting ? "crosshair" : "auto"
  );

  return {
    isHovered,
    setIsHovered,
  };
};

/**
 * Custom hook for managing event handlers and tooltip integration
 */
export const useEventHandlers = (tooltip: any, label: any): EventHandlers => {
  const { onPointerOver, onPointerOut, ...restEventHandlers } = useMemo(() => {
    return {
      ...tooltip.getMeshProps(label),
    };
  }, [tooltip, label]);

  return {
    onPointerOver,
    onPointerOut,
    restEventHandlers,
  };
};

/**
 * Custom hook for managing color logic with selection, hover, and similarity states
 */
export const useLabelColor = (
  props: Pick<BaseOverlayProps, "selected" | "color">,
  isHovered: boolean,
  label: any,
  isSelectedForAnnotation?: boolean
) => {
  const isSimilarLabelHovered = useSimilarLabels3d(label);

  const strokeAndFillColor = use3dLabelColor({
    isSelected: props.selected,
    isHovered,
    isSimilarLabelHovered,
    defaultColor: props.color,
    isSelectedForAnnotation,
  });

  return {
    strokeAndFillColor,
    isSimilarLabelHovered,
  };
};
