import { useInferenceStatus } from "@fiftyone/annotation/src/agents/hooks/useInferenceStatus";
import { useToolsContext } from "@fiftyone/annotation/src/agents/hooks/useToolsContext";
import type { PolylineAnnotationLabel } from "@fiftyone/state";
import { useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";
import { StatusContent, useModalStatusBar } from "../../../ModalStatusBar";
import {
  AISegmentationStatus,
  BrushStatus,
  DetectionStatus,
  MergeInitialStatus,
  MergeTargetSetStatus,
  PenStatus,
  PolylineEntryStatus,
  PolylineProgressStatus,
} from "./annotationStatusContent";
import { currentData } from "./state";
import { _unsafeDetectionModeActiveAtom } from "./useDetectionMode";
import { _unsafeMergeTargetIdAtom } from "./useMergeTool";
import { _unsafePolylineModeActiveAtom } from "./usePolylineMode";
import {
  SegmentationTool,
  _unsafeSegmentationModeActiveAtom,
  _unsafeToolAtom,
} from "./useSegmentationMode";

const countVertices = (
  points: PolylineAnnotationLabel["data"]["points"] | undefined
): number => points?.reduce((total, segment) => total + segment.length, 0) ?? 0;

/**
 * Single hook that owns the modal status bar across all annotation modes.
 *
 * Reads every relevant mode/tool atom, dispatches to a pure content
 * component, and registers the result via `setContent`. Centralizing the
 * dispatch makes "exactly one writer at a time" a structural guarantee
 * rather than a convention each mode has to honor.
 */
export const useAnnotationStatus = () => {
  const { setContent } = useModalStatusBar();

  const detectionModeActive = useAtomValue(_unsafeDetectionModeActiveAtom);
  const segmentationModeActive = useAtomValue(
    _unsafeSegmentationModeActiveAtom
  );
  const polylineModeActive = useAtomValue(_unsafePolylineModeActiveAtom);
  const tool = useAtomValue(_unsafeToolAtom);
  const mergeTargetId = useAtomValue(_unsafeMergeTargetIdAtom);
  const {
    status: inferenceStatus,
    progress: inferenceProgress,
    error: inferenceError,
  } = useInferenceStatus();
  const { positivePoints, negativePoints } = useToolsContext();
  const polylineData = useAtomValue(currentData) as
    | PolylineAnnotationLabel["data"]
    | null;

  const vertexCount = countVertices(polylineData?.points);
  const hasAiPoints =
    (positivePoints?.length ?? 0) + (negativePoints?.length ?? 0) > 0;

  const content = useMemo<StatusContent>(() => {
    if (detectionModeActive) return <DetectionStatus />;

    if (segmentationModeActive) {
      switch (tool) {
        case SegmentationTool.Brush:
          return <BrushStatus />;
        case SegmentationTool.Pen:
          return <PenStatus />;
        case SegmentationTool.AI:
          return (
            <AISegmentationStatus
              status={inferenceStatus}
              progress={inferenceProgress}
              error={inferenceError}
              hasPoints={hasAiPoints}
            />
          );
        case SegmentationTool.Merge:
          return mergeTargetId ? (
            <MergeTargetSetStatus />
          ) : (
            <MergeInitialStatus />
          );
        default:
          return null;
      }
    }

    if (polylineModeActive) {
      if (vertexCount === 0) return <PolylineEntryStatus />;
      return <PolylineProgressStatus vertexCount={vertexCount} />;
    }

    return null;
  }, [
    detectionModeActive,
    segmentationModeActive,
    polylineModeActive,
    tool,
    mergeTargetId,
    inferenceStatus,
    inferenceProgress,
    inferenceError,
    hasAiPoints,
    vertexCount,
  ]);

  useEffect(() => {
    if (content === null) return undefined;
    setContent(content);
    return () => {
      setContent(null);
    };
  }, [content, setContent]);
};
