import { useInferenceStatus } from "@fiftyone/annotation/src/agents";
import { ANNOTATION_CUBOID } from "@fiftyone/looker-3d/src/constants";
import { useCurrent3dAnnotationMode } from "@fiftyone/looker-3d/src/state/accessors";
import type { PolylineAnnotationLabel } from "@fiftyone/state";
import { useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";
import { StatusContent, useModalStatusBar } from "../../../ModalStatusBar";
import {
  aiSegmentationStatus,
  brushStatus,
  detectionStatus,
  mergeInitialStatus,
  mergeTargetSetStatus,
  penStatus,
  polylineEntryStatus,
  polylineProgressStatus,
} from "./annotationStatusContent";
import { useAnnotationContext } from "./useAnnotationContext";
import { _unsafeDetectionModeActiveAtom } from "./useDetectionMode";
import { _unsafeMergeTargetIdAtom } from "./useMergeTool";
import { _unsafePolylineModeActiveAtom } from "./usePolylineMode";
import {
  SegmentationTool,
  _unsafeSegmentationModeActiveAtom,
  _unsafeToolAtom,
} from "./useSegmentationMode";

const countVertices = (
  points: PolylineAnnotationLabel["data"]["points"] | undefined,
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
  const current3dAnnotationMode = useCurrent3dAnnotationMode();
  const segmentationModeActive = useAtomValue(
    _unsafeSegmentationModeActiveAtom,
  );
  const polylineModeActive = useAtomValue(_unsafePolylineModeActiveAtom);
  const tool = useAtomValue(_unsafeToolAtom);
  const mergeTargetId = useAtomValue(_unsafeMergeTargetIdAtom);
  const {
    status: inferenceStatus,
    progress: inferenceProgress,
    error: inferenceError,
  } = useInferenceStatus();
  const { selected } = useAnnotationContext();
  const polylineData = (selected?.data ?? null) as
    | PolylineAnnotationLabel["data"]
    | null;

  const vertexCount = countVertices(polylineData?.points);
  const cuboidModeActive = current3dAnnotationMode === ANNOTATION_CUBOID;

  const content = useMemo<StatusContent>(() => {
    if (cuboidModeActive) return detectionStatus(true);

    if (detectionModeActive) return detectionStatus();

    if (segmentationModeActive) {
      switch (tool) {
        case SegmentationTool.Brush:
          return brushStatus();
        case SegmentationTool.Pen:
          return penStatus();
        case SegmentationTool.AI:
          return aiSegmentationStatus({
            status: inferenceStatus,
            progress: inferenceProgress,
            error: inferenceError,
          });
        case SegmentationTool.Merge:
          return mergeTargetId ? mergeTargetSetStatus() : mergeInitialStatus();
        default:
          return null;
      }
    }

    if (polylineModeActive) {
      if (vertexCount === 0) return polylineEntryStatus();
      return polylineProgressStatus(vertexCount);
    }

    return null;
  }, [
    cuboidModeActive,
    detectionModeActive,
    segmentationModeActive,
    polylineModeActive,
    tool,
    mergeTargetId,
    inferenceStatus,
    inferenceProgress,
    inferenceError,
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
