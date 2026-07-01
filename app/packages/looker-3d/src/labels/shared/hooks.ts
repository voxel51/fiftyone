import { useAnnotationEngine } from "@fiftyone/annotation";
import {
  LabelHoveredEvent,
  LabelUnhoveredEvent,
  selectiveRenderingEventBus,
} from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
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
    ? label.path[label.path.length - 1]
    : label.path;
  return {
    field,
    label,
    type: label.type,
    color: label.color,
    sampleId: label.sampleId,
  };
};

const shouldSuppressLabelTooltip = (
  e?: Pick<ThreeEvent<PointerEvent>, "altKey" | "metaKey" | "shiftKey">,
) => Boolean(e?.shiftKey || e?.metaKey || e?.altKey);

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
    isSegmenting ? "crosshair" : "auto",
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
      (e?: ThreeEvent<PointerEvent>) => {
        const selectedLabel = snapshot
          .getLoadable(selectedLabelForAnnotationAtom)
          .getValue();
        if (selectedLabel?._id === label._id) return;

        const isCurrentlyTransforming = Boolean(
          snapshot.getLoadable(isCurrentlyTransformingAtom).getValue(),
        );
        if (isCurrentlyTransforming) return;

        const isTooltipLocked = snapshot
          .getLoadable(fos.isTooltipLocked)
          .getValue();

        if (!isTooltipLocked) {
          if (shouldSuppressLabelTooltip(e)) {
            set(fos.tooltipDetail, null);
          } else {
            set(fos.tooltipDetail, getDetailsFromLabel(label));
          }
        }

        if (!label.instance || !label.sampleId) return;

        selectiveRenderingEventBus.emit(
          new LabelHoveredEvent({
            sampleId: label.sampleId,
            labelId: label.id,
            instanceId: label.instance._id,
            field: label.path,
            frameNumber: label.frame_number,
          }),
        );
      },
    [label],
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
    [label],
  );

  const onPointerMissed = useRecoilCallback(
    ({ snapshot, set }) =>
      () => {
        const isTooltipLocked = snapshot
          .getLoadable(fos.isTooltipLocked)
          .getValue();

        if (!isTooltipLocked) {
          set(fos.tooltipDetail, null);
        }
      },
    [],
  );

  const onPointerMove = useRecoilCallback(
    ({ snapshot, set }) =>
      (e: ThreeEvent<PointerEvent>) => {
        const selectedLabel = snapshot
          .getLoadable(selectedLabelForAnnotationAtom)
          .getValue();
        if (selectedLabel?._id === label._id) return;

        const isCurrentlyTransforming = Boolean(
          snapshot.getLoadable(isCurrentlyTransformingAtom).getValue(),
        );

        if (isCurrentlyTransforming) {
          set(fos.tooltipDetail, null);
        }

        const isTooltipLocked = snapshot
          .getLoadable(fos.isTooltipLocked)
          .getValue();

        if (isTooltipLocked) return;

        if (shouldSuppressLabelTooltip(e)) {
          set(fos.tooltipDetail, null);
          return;
        }

        if (e.ctrlKey) {
          set(fos.isTooltipLocked, true);
        } else {
          set(
            fos.tooltipCoordinates,
            fos.computeCoordinates([e.clientX, e.clientY]),
          );
        }
      },
    [label],
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

  // the renderer is shared with explore; the ENGINE hover write-half only
  // applies in annotate mode (the engine has no registered store in explore).
  // Gate on the mode, not `canAnnotate` (which is true in explore on an
  // annotatable dataset).
  const isAnnotateMode = fos.useModalMode() === "annotate";
  const engine = useAnnotationEngine();
  // 3D labels belong to the pinned 3D scene's sample (the working-store key),
  // not the selected 2D slice in a grouped modal
  const sample = fos.useCurrentSampleId();

  // this surface's hover write-half: pointer events write the ENGINE's
  // hovered set with an explicit ref captured here at the dispatch site;
  // the read-halves (sidebar rows, the 3D adapter) follow it. The tooltip
  // handler runs first so it is never coupled to annotation state.
  return {
    onPointerOver: useCallback(
      (e?: ThreeEvent<PointerEvent>) => {
        _onPointerOver(e);

        if (!isAnnotateMode) {
          return;
        }

        const id = label?._id ?? label?.id;
        const path = Array.isArray(label?.path)
          ? label.path.join(".")
          : label?.path;

        if (id && path && sample) {
          engine.interaction.setHovered({ sample, path, instanceId: id }, true);
        }
      },
      [label, isAnnotateMode, engine, sample, _onPointerOver],
    ),
    onPointerOut: useCallback(() => {
      _onPointerOut();

      if (!isAnnotateMode) {
        return;
      }

      // resolve from the hovered set itself, so hover-off works even after
      // the label has been deleted or replaced
      const id = label?._id ?? label?.id;
      const ref = engine.interaction
        .getHovered()
        .find((hovered) => hovered.instanceId === id);

      if (ref) {
        engine.interaction.setHovered(ref, false);
      }
    }, [label, isAnnotateMode, engine, _onPointerOut]),
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
  isSelectedForAnnotation?: boolean,
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
