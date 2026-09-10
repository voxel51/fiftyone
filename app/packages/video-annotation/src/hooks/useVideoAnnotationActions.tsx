import type { ToolbarActionGroup } from "@fiftyone/components";
import { usePlayhead } from "@fiftyone/playback";
import { useModalSample } from "@fiftyone/state";
import { Icon, IconName, Size } from "@voxel51/voodo";
import { useMemo } from "react";
import { AiTrackUpsellButton } from "../components/AiTrackUpsellButton";
import { KeyframeDiamondIcon } from "../components/KeyframeDiamondIcon";
import { useCurrentFrame } from "../state/useCurrentFrame";
import { resolveFrameCount } from "../utils/frameCount";
import { useTemporalDetectionTarget } from "./useTemporalDetectionTarget";
import { useTrackSelectionGates } from "./useTrackSelectionGates";
import { useVideoSurfaceActions } from "./useVideoSurfaceActions";

/**
 * Data-driven config for the video annotation toolbar; each item owns its own
 * enablement, tooltip, and dispatch. Mount inside the surface's
 * `<PlaybackProvider>` and command bus.
 */
export const useVideoAnnotationActions = (): ToolbarActionGroup[] => {
  const actions = useVideoSurfaceActions();
  const playhead = usePlayhead();
  const playheadFrame = useCurrentFrame();
  const modalSample = useModalSample();

  const {
    fieldPath: tdFieldPath,
    defaultLabel: tdDefaultLabel,
    fps,
    hasUsableFps,
    canCreate: canCreateTd,
  } = useTemporalDetectionTarget();

  const {
    selectedIds,
    hasSelection,
    selectionIsKeyframeable,
    selectionIsInstanceTrack,
    selectedTrackField,
    isKeyframeAtPlayhead,
    canMarkKeyframe,
    canSplit,
  } = useTrackSelectionGates(playhead, hasUsableFps);

  return useMemo<ToolbarActionGroup[]>(
    () => [
      {
        id: "video-annotation-edit",
        label: "Edit",
        actions: [
          {
            id: "create-temporal-detection",
            label: "New TD",
            icon: <Icon name={IconName.Add} size={Size.Sm} />,
            // disabled with an explanation rather than hidden
            tooltip: canCreateTd
              ? `Create a TemporalDetection on \`${tdFieldPath}\``
              : "No TemporalDetections field on this dataset",
            isDisabled: !canCreateTd,
            onClick: () => {
              if (!canCreateTd || !tdFieldPath || !fps) return;
              // a 1-second window from the playhead, capped at the last frame
              const startFrame = playheadFrame;
              const endFrame = Math.min(
                startFrame + Math.round(fps),
                resolveFrameCount(modalSample, fps) ?? Infinity,
              );
              actions.createTemporalDetection(
                tdFieldPath,
                [startFrame, endFrame],
                tdDefaultLabel,
              );
            },
          },
          {
            id: "mark-keyframe",
            label: "Mark Keyframe",
            icon: <KeyframeDiamondIcon filled={isKeyframeAtPlayhead} />,
            shortcut: "K",
            tooltip: !hasSelection
              ? "Select a label to mark a keyframe"
              : !selectionIsKeyframeable
                ? "Keyframes are only available for detections and polylines"
                : "Toggle keyframe at this frame",
            isDisabled: !canMarkKeyframe,
            onClick: () => {
              if (!canMarkKeyframe) return;
              actions.markKeyframe(playhead, selectedIds);
            },
          },
          {
            id: "split-track",
            label: "Split",
            icon: <Icon name={IconName.UnfoldMore} size={Size.Sm} />,
            tooltip: canSplit
              ? "Split the selected track at this frame"
              : !hasUsableFps
                ? "This video has no usable frame rate"
                : selectedIds.length === 1 && !selectionIsInstanceTrack
                  ? "Splitting is only available for detections and polylines"
                  : "Select one track to split it at the playhead",
            isDisabled: !canSplit,
            onClick: () => {
              if (!canSplit || !fps) {
                return;
              }

              actions.splitTrack(
                selectedIds[0],
                playheadFrame,
                selectedTrackField ?? undefined,
              );
            },
          },
          {
            // upsell for AI tracking (not in the OSS app); the toolbar renders
            // `customComponent`, so `onClick` is an unreachable required no-op
            id: "ai-track",
            label: "AI Track",
            icon: <Icon name={IconName.AI} size={Size.Sm} />,
            onClick: () => {},
            customComponent: <AiTrackUpsellButton />,
          },
        ],
      },
    ],
    [
      actions,
      canCreateTd,
      canMarkKeyframe,
      canSplit,
      fps,
      hasSelection,
      hasUsableFps,
      isKeyframeAtPlayhead,
      modalSample,
      playhead,
      playheadFrame,
      selectedIds,
      selectedTrackField,
      selectionIsInstanceTrack,
      selectionIsKeyframeable,
      tdDefaultLabel,
      tdFieldPath,
    ],
  );
};
