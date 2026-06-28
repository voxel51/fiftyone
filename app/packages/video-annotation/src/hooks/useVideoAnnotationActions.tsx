import type { ToolbarActionGroup } from "@fiftyone/components";
import { useModalSample } from "@fiftyone/state";
import { Icon, IconName, Size } from "@voxel51/voodo";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { frameAt, usePlayhead } from "@fiftyone/playback";
import { getModalSampleFrameRate } from "../utils/modalSample";
import {
  labelSchemaData,
  useTemporalDetectionFieldPaths,
} from "../state/accessors";
import {
  useSelectedTrackIds,
  useSelectionIsInstanceTrack,
  useSelectionIsKeyframeable,
} from "../state/useVideoInteraction";
import { useFrameKeyframeState } from "./useFrameKeyframeState";
import { useVideoSurfaceActions } from "./useVideoSurfaceActions";

/**
 * Small SVG diamond glyph used by the Mark Keyframe toolbar button. Filled
 * matches a keyframe present at the playhead on the selected track; outlined
 * is the absent / no-selection state. Mirrors the lane's rotated-square
 * keyframe marker so the toolbar reads as "this glyph = a keyframe".
 */
const DiamondIcon = ({ filled }: { filled: boolean }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    aria-hidden="true"
    focusable="false"
    style={{ display: "block" }}
  >
    <rect
      x="3.05"
      y="3.05"
      width="7.9"
      height="7.9"
      transform="rotate(45 7 7)"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="miter"
    />
  </svg>
);

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

  // Default class for a freshly-created TemporalDetection: schema's `default`
  // if set, else the first declared class. Mirrors `buildNewLabelData` in
  // core's createNew.ts so the surface matches the sidebar's create flow.
  const tdSchema = useAtomValue(labelSchemaData(tdFieldPath ?? ""));
  const tdSchemaDefault = tdSchema?.label_schema?.default;
  const tdDefaultLabel: string | undefined =
    typeof tdSchemaDefault === "string"
      ? tdSchemaDefault
      : tdSchema?.label_schema?.classes?.[0];

  // Selection is keyed on the engine instanceId.
  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const hasSelection = selectedIds.length > 0;

  // Type gates: keyframes are detections-only; split also admits polylines.
  // Both are false on TD / classification selections.
  const selectionIsKeyframeable = useSelectionIsKeyframeable();
  const selectionIsInstanceTrack = useSelectionIsInstanceTrack();

  // Reactive: filled when the (single) selected track has a keyframe at the
  // current playhead. Outline otherwise (no selection, multi-selection, or no
  // detection on this frame). See {@link useFrameKeyframeState}.
  const isKeyframeAtPlayhead = useFrameKeyframeState(selectedIds, playhead);

  // Mark Keyframe needs a detection selection.
  const canMarkKeyframe = hasSelection && selectionIsKeyframeable;

  // split needs one instance-track (detection / polyline) + a playhead frame
  const canSplit =
    selectedIds.length === 1 &&
    selectionIsInstanceTrack &&
    Number.isFinite(fps) &&
    !!fps &&
    fps > 0;

  return useMemo<ToolbarActionGroup[]>(
    () => [
      {
        id: "video-annotation-edit",
        label: "Edit",
        actions: [
          {
            id: "mark-keyframe",
            label: "Mark Keyframe",
            icon: <DiamondIcon filled={isKeyframeAtPlayhead} />,
            shortcut: "K",
            tooltip: !hasSelection
              ? "Select a label to mark a keyframe"
              : !selectionIsKeyframeable
                ? "Keyframes are only available for detections"
                : "Toggle keyframe at this frame",
            isDisabled: !canMarkKeyframe,
            onClick: () => {
              if (!canMarkKeyframe) return;
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
              actions.createTemporalDetection(
                tdFieldPath,
                [startFrame, endFrame],
                tdDefaultLabel,
              );
            },
          },
          {
            id: "split-track",
            label: "Split",
            icon: <Icon name={IconName.UnfoldMore} size={Size.Sm} />,
            tooltip: canSplit
              ? "Split the selected track at this frame"
              : selectedIds.length === 1 && !selectionIsInstanceTrack
                ? "Splitting is only available for detections and polylines"
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
      canMarkKeyframe,
      canSplit,
      fps,
      hasSelection,
      isKeyframeAtPlayhead,
      playhead,
      selectedIds,
      selectionIsInstanceTrack,
      selectionIsKeyframeable,
      tdDefaultLabel,
      tdFieldPath,
    ],
  );
};
