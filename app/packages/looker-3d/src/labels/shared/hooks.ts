import { useAnnotationEventBus } from "@fiftyone/annotation";
import useCanAnnotate from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/useCanAnnotate";
import { useCursor } from "@react-three/drei";
import { useCallback, useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import { use3dLabelColor } from "../../hooks/use-3d-label-color";
import { useSimilarLabels3d } from "../../hooks/use-similar-labels-3d";
import {
  editSegmentsModeAtom,
  isActivelySegmentingSelector,
} from "../../state";
import type { BaseOverlayProps, EventHandlers, HoverState } from "../../types";

/**
 * Custom hook for managing hover state and cursor behavior
 */
export const useHoverState = (): HoverState => {
  const isSegmenting = useRecoilValue(isActivelySegmentingSelector);
  const [isHovered, setIsHovered] = useState(false);
  const isEditSegmentsMode = useRecoilValue(editSegmentsModeAtom);

  useCursor(
    isHovered,
    isSegmenting || isEditSegmentsMode ? "crosshair" : "pointer",
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
  const {
    onPointerOver: _onPointerOver,
    onPointerOut: _onPointerOut,
    ...restEventHandlers
  } = useMemo(() => {
    return {
      ...tooltip.getMeshProps(label),
    };
  }, [tooltip, label]);

  const canAnnotate = useCanAnnotate();
  const annotationEventBus = useAnnotationEventBus();

  return {
    onPointerOver: useCallback(() => {
      if (canAnnotate) {
        annotationEventBus.dispatch(
          "annotation:notification:canvasOverlayHover",
          {
            id: label.id,
          }
        );
      }

      _onPointerOver();
    }, [label, canAnnotate, annotationEventBus]),
    onPointerOut: useCallback(() => {
      if (canAnnotate) {
        annotationEventBus.dispatch(
          "annotation:notification:canvasOverlayUnhover",
          {
            id: label.id,
          }
        );
      }

      _onPointerOut();
    }, [label, canAnnotate, annotationEventBus]),
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
