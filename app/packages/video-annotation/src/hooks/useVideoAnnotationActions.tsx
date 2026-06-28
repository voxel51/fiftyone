import type { ToolbarActionGroup } from "@fiftyone/components";
import { useModalSample } from "@fiftyone/state";
import CallMerge from "@mui/icons-material/CallMerge";
import { Icon, IconName, Size } from "@voxel51/voodo";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { frameAt, usePlayhead } from "@fiftyone/playback";
import { getModalSampleFrameRate } from "../utils/modalSample";
import {
  labelSchemaData,
  useTemporalDetectionFieldPaths,
} from "../state/accessors";
import { useMergeFlow } from "../state/useMergeFlow";
import {
  useIsFrameLevelSelection,
  useSelectedTrackIds,
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
  const mergeFlow = useMergeFlow();

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

  // Selection is keyed on the engine instanceId — the same id the propagation
  // target resolver matches against the per-frame detections.
  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const hasSelection = selectedIds.length > 0;

  // True iff selection is non-empty AND every active ref is a per-frame track
  // (path under `frames.*`). Sample-level tracks like TemporalDetections fail
  // this check — Mark Keyframe / Split / Merge are meaningless for them.
  const isFrameLevelSelection = useIsFrameLevelSelection();
  const selectionIsTd = hasSelection && !isFrameLevelSelection;
  const tdTooltip = "Not available for temporal detection tracks";

  // Reactive: filled when the (single) selected track has a keyframe at the
  // current playhead. Outline otherwise (no selection, multi-selection, or no
  // detection on this frame). See {@link useFrameKeyframeState}.
  const isKeyframeAtPlayhead = useFrameKeyframeState(selectedIds, playhead);

  // split needs one track + a playhead frame; merge now uses a two-click
  // stateful flow (select target → click Merge → click source), so we only
  // require one selected track to arm the button
  const canMarkKeyframe = hasSelection && isFrameLevelSelection;
  const canSplit =
    selectedIds.length === 1 &&
    Number.isFinite(fps) &&
    !!fps &&
    fps > 0 &&
    isFrameLevelSelection;
  const canMerge =
    (selectedIds.length === 1 || mergeFlow.pending) && isFrameLevelSelection;

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
            tooltip: selectionIsTd
              ? tdTooltip
              : hasSelection
                ? "Toggle keyframe at this frame"
                : "Select a label to mark a keyframe",
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
            tooltip: selectionIsTd
              ? tdTooltip
              : canSplit
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
          {
            id: "merge-tracks",
            label: "Merge",
            icon: <CallMerge fontSize="small" />,
            // Two-click flow: the first-selected track is the target
            // (survives); the next-clicked track is the source (consumed).
            // Clicking the button while already pending toggles off.
            tooltip: selectionIsTd
              ? tdTooltip
              : mergeFlow.pending
                ? "Click another track to merge it into the selected one"
                : canMerge
                  ? "Click Merge, then click another track to merge it in"
                  : "Select a track to merge another into it",
            isActive: mergeFlow.pending,
            isDisabled: !canMerge,
            onClick: () => {
              if (mergeFlow.pending) {
                mergeFlow.cancelMerge();
                return;
              }

              if (selectedIds.length !== 1) {
                return;
              }

              mergeFlow.beginMerge(selectedIds[0]);
            },
          },
        ],
      },
    ],
    [
      actions,
      canCreateTd,
      canMarkKeyframe,
      canMerge,
      canSplit,
      fps,
      hasSelection,
      isKeyframeAtPlayhead,
      mergeFlow,
      playhead,
      selectedIds,
      selectionIsTd,
      tdDefaultLabel,
      tdFieldPath,
    ],
  );
};
