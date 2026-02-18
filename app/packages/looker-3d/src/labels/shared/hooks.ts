import { useAnnotationEventBus } from "@fiftyone/annotation";
import useCanAnnotate from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/useCanAnnotate";
import {
  LabelHoveredEvent,
  LabelUnhoveredEvent,
  selectiveRenderingEventBus,
} from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import { computeCoordinates } from "@fiftyone/state/src/hooks/useTooltip";
import { useCursor } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useCallback, useState } from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { use3dLabelColor } from "../../hooks/use-3d-label-color";
import { useSimilarLabels3d } from "../../hooks/use-similar-labels-3d";
import {
  editSegmentsModeAtom,
  isActivelySegmentingSelector,
  isCurrentlyTransformingAtom,
  selectedLabelForAnnotationAtom,
} from "../../state";
import type { BaseOverlayProps, EventHandlers, HoverState } from "../../types";

const getDetailsFromLabel = (label: any) => {
  const field = Array.isArray(label.path)
    ? [label.path.length - 1]
    : label.path;
  return {
    field,
    label,
    type: label.type,
    color: label.color,
    sampleId: label.sampleId,
  };
};

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
 * Hook that provides mesh pointer event handlers.
 */
const useMeshTooltipProps = (label: any) => {
  const onPointerOver = useRecoilCallback(
    ({ snapshot, set }) =>
      () => {
        const selectedLabel = snapshot
          .getLoadable(selectedLabelForAnnotationAtom)
          .getValue();
        if (selectedLabel?._id === label._id) return;

        const isCurrentlyTransforming = Boolean(
          snapshot.getLoadable(isCurrentlyTransformingAtom).getValue()
        );
        if (isCurrentlyTransforming) return;

        set(fos.tooltipDetail, getDetailsFromLabel(label));

        if (!label.instance) return;

        const sampleId = snapshot.getLoadable(fos.pinned3DSample).getValue()
          .sample._id;

        selectiveRenderingEventBus.emit(
          new LabelHoveredEvent({
            sampleId,
            labelId: label.id,
            instanceId: label.instance._id,
            field: label.path,
            frameNumber: label.frame_number,
          })
        );
      },
    [label]
  );

  const onPointerOut = useRecoilCallback(
    ({ snapshot, set }) =>
      () => {
        const isTooltipLocked = snapshot
          .getLoadable(fos.isTooltipLocked)
          .getValue();

        if (!isTooltipLocked) {
          set(fos.tooltipDetail, null);
        }

        if (!label.instance) return;

        selectiveRenderingEventBus.emit(new LabelUnhoveredEvent());
      },
    [label]
  );

  const onPointerMissed = useRecoilCallback(
    ({ snapshot, set }) =>
      () => {
        const isTooltipLocked = snapshot
          .getLoadable(fos.isTooltipLocked)
          .getValue();

        if (!isTooltipLocked) {
          set(fos.tooltipDetail, null);
          set(fos.isTooltipLocked, false);
        }
      },
    []
  );

  const onPointerMove = useRecoilCallback(
    ({ snapshot, set }) =>
      (e: ThreeEvent<PointerEvent>) => {
        const selectedLabel = snapshot
          .getLoadable(selectedLabelForAnnotationAtom)
          .getValue();
        if (selectedLabel?._id === label._id) return;

        const isCurrentlyTransforming = Boolean(
          snapshot.getLoadable(isCurrentlyTransformingAtom).getValue()
        );

        if (isCurrentlyTransforming) {
          set(fos.tooltipDetail, null);
        }

        const isTooltipLocked = snapshot
          .getLoadable(fos.isTooltipLocked)
          .getValue();

        if (isTooltipLocked) return;

        if (e.ctrlKey) {
          set(fos.isTooltipLocked, true);
        } else {
          set(
            fos.tooltipCoordinates,
            computeCoordinates([e.clientX, e.clientY])
          );
        }
      },
    [label]
  );

  return { onPointerOver, onPointerOut, onPointerMissed, onPointerMove };
};

/**
 * Custom hook for managing event handlers and tooltip integration
 */
export const useEventHandlers = (label: any): EventHandlers => {
  const {
    onPointerOver: _onPointerOver,
    onPointerOut: _onPointerOut,
    ...restEventHandlers
  } = useMeshTooltipProps(label);

  const canAnnotate = useCanAnnotate();
  const annotationEventBus = useAnnotationEventBus();

  return {
    onPointerOver: useCallback(() => {
      if (canAnnotate) {
        annotationEventBus.dispatch("annotation:canvasOverlayHover", {
          id: label.id ?? label._id,
        });
      }

      _onPointerOver();
    }, [label, canAnnotate, annotationEventBus, _onPointerOver]),
    onPointerOut: useCallback(() => {
      if (canAnnotate) {
        annotationEventBus.dispatch("annotation:canvasOverlayUnhover", {
          id: label.id ?? label._id,
        });
      }

      _onPointerOut();
    }, [label, canAnnotate, annotationEventBus, _onPointerOut]),
    ...restEventHandlers,
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
