import type { ToolbarActionGroup } from "@fiftyone/components";
import { useModalSample } from "@fiftyone/state";
import { Icon, IconName, Size } from "@voxel51/voodo";
import { useMemo } from "react";
import { frameAt, usePlayhead } from "@fiftyone/playback";
import { getModalSampleFrameRate } from "../utils/modalSample";
import { useTemporalDetectionFieldPaths } from "../state/accessors";
import { useSelectedTrackIds } from "../state/useVideoInteraction";
import { useVideoSurfaceActions } from "./useVideoSurfaceActions";

/**
 * Builds the data-driven config for the video annotation toolbar, mirroring
 * the `ToolbarActionGroup` pattern used by `ActionToolbar` (segmentation, 3D).
 *
 * This hook is the single extension point for toolbar functionality: to add a
 * button, append a {@link ToolbarActionItem} to a group's `actions` (or add a
 * new group). Each item owns its own enablement, tooltip, and dispatch, so the
 * renderer stays dumb and the toolbar doesn't grow into a monolith as features
 * land. Reactive to the visual playhead and the intentional-selection atom, so
 * enabled state and tooltips track the user scrubbing / selecting in real time.
 *
 * Mount inside the surface's `<PlaybackProvider>` + command bus (it is, via
 * `FrameLabelsTracks`).
 */
export const useVideoAnnotationActions = (): ToolbarActionGroup[] => {
  const actions = useVideoSurfaceActions();
  const playhead = usePlayhead();
  const selected = useSelectedTrackIds();
  const modalSample = useModalSample();

  // Resolve from the dataset schema
  const tdFieldPaths = useTemporalDetectionFieldPaths();

  const tdFieldPath = useMemo(
    // Sample-level only — temporal detections are video-level; the create
    // command targets a top-level field path.
    () => tdFieldPaths.find((p) => !p.startsWith("frames.")) ?? null,
    [tdFieldPaths],
  );
  const fps = getModalSampleFrameRate(modalSample);
  const canCreateTd =
    !!tdFieldPath && Number.isFinite(fps) && fps !== undefined && fps > 0;

  // Selection is keyed on the engine instanceId.
  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const hasSelection = selectedIds.length > 0;

  // split needs one track + a playhead frame
  const canSplit =
    selectedIds.length === 1 && Number.isFinite(fps) && !!fps && fps > 0;

  return useMemo<ToolbarActionGroup[]>(
    () => [
      {
        id: "video-annotation-edit",
        label: "Edit",
        actions: [
          {
            id: "mark-keyframe",
            label: "Mark Keyframe",
            icon: <Icon name={IconName.VAL} size={Size.Sm} />,
            shortcut: "K",
            tooltip: hasSelection
              ? "Toggle keyframe at this frame"
              : "Select a label to mark a keyframe",
            isDisabled: !hasSelection,
            onClick: () => {
              if (!hasSelection) return;
              actions.markKeyframe(playhead, selectedIds);
            },
          },
          {
            id: "create-temporal-detection",
            label: "New TD",
            icon: <Icon name={IconName.Add} size={Size.Sm} />,
            tooltip: canCreateTd
              ? `Create a TemporalDetection on \`${tdFieldPath}\``
              : "No TemporalDetections field on this dataset",
            isDisabled: !canCreateTd,
            onClick: () => {
              if (!canCreateTd || !tdFieldPath || !fps) return;
              // Default: 1-second window starting at the playhead frame.
              const startFrame = frameAt(playhead, fps);
              const endFrame = startFrame + Math.round(fps);
              actions.createTemporalDetection(tdFieldPath, [
                startFrame,
                endFrame,
              ]);
            },
          },
          {
            id: "split-track",
            label: "Split",
            icon: <Icon name={IconName.UnfoldMore} size={Size.Sm} />,
            tooltip: canSplit
              ? "Split the selected track at this frame"
              : "Select one track to split it at the playhead",
            isDisabled: !canSplit,
            onClick: () => {
              if (!canSplit || !fps) {
                return;
              }

              actions.splitTrack(selectedIds[0], frameAt(playhead, fps));
            },
          },
        ],
      },
    ],
    [
      actions,
      canCreateTd,
      canSplit,
      fps,
      hasSelection,
      playhead,
      selectedIds,
      tdFieldPath,
    ],
  );
};
