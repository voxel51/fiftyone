import {
  CreateTemporalDetectionCommand,
  MarkKeyframeCommand,
  PropagateCommand,
} from "@fiftyone/annotation";
import { useCommandBus } from "@fiftyone/command-bus";
import type { ToolbarActionGroup } from "@fiftyone/components";
import { fieldPaths, useModalSample } from "@fiftyone/state";
import {
  EMBEDDED_DOCUMENT_FIELD,
  TEMPORAL_DETECTIONS_FIELD,
} from "@fiftyone/utilities";
import { Icon, IconName, Size } from "@voxel51/voodo";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { frameAt } from "../../../playback/src/lib/playback/utils";
import { usePlayhead } from "../../../playback/src/lib/playback/use-playback-state";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";
import { resolvePropagationTarget } from "../propagation/propagationTarget";
import { selectedOverlayIds } from "./useLinkedOverlayState";

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
  const bus = useCommandBus();
  const stream = useFrameLabelsStream();
  const playhead = usePlayhead();
  const selected = useAtomValue(selectedOverlayIds);
  const modalSample = useModalSample();

  // Resolve from the dataset schema
  const tdFieldPaths = useRecoilValue(
    fieldPaths({
      ftype: EMBEDDED_DOCUMENT_FIELD,
      embeddedDocType: TEMPORAL_DETECTIONS_FIELD,
    })
  );

  const tdFieldPath = useMemo(
    // Sample-level only — temporal detections are video-level; the create
    // command targets a top-level field path.
    () => tdFieldPaths.find((p) => !p.startsWith("frames.")) ?? null,
    [tdFieldPaths]
  );
  const fps = modalSample?.frameRate;
  const canCreateTd =
    !!tdFieldPath && Number.isFinite(fps) && fps !== undefined && fps > 0;

  // Selection atom is keyed on the synthetic overlay id, the same id the
  // stream snapshot and command handlers agree on.
  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const hasSelection = selectedIds.length > 0;

  // Recomputed each playhead tick / selection change so the Propagate
  // affordance reflects the current frame's bracketing keyframes. When
  // disabled, `reason` becomes the tooltip — the "why can't I propagate?"
  // diagnostic.
  const target = useMemo(() => {
    if (!stream) {
      return { ok: false as const, reason: "No active video stream." };
    }
    return resolvePropagationTarget(stream, selectedIds, playhead);
  }, [stream, selectedIds, playhead]);

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
              void bus.execute(new MarkKeyframeCommand(playhead, selectedIds));
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
              void bus.execute(
                new CreateTemporalDetectionCommand(tdFieldPath, [
                  startFrame,
                  endFrame,
                ])
              );
            },
          },
          {
            id: "propagate-sam2",
            label: "Track (SAM2)",
            icon: <Icon name={IconName.AI} size={Size.Sm} />,
            tooltip: target.ok
              ? `Track frames ${target.fromFrame}–${target.toFrame} with SAM2`
              : target.reason,
            isDisabled: !target.ok,
            onClick: () => {
              if (!target.ok) {
                return;
              }

              void bus.execute(
                new PropagateCommand(
                  target.instanceId,
                  target.fromFrame,
                  target.toFrame,
                  "sam2"
                )
              );
            },
          },
        ],
      },
    ],
    [
      bus,
      canCreateTd,
      fps,
      hasSelection,
      playhead,
      selectedIds,
      target,
      tdFieldPath,
    ]
  );
};
