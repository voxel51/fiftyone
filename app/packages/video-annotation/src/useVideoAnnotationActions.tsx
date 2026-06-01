import {
  CreateTemporalDetectionCommand,
  MarkKeyframeCommand,
  PropagateCommand,
} from "@fiftyone/annotation";
import { useCommandBus } from "@fiftyone/command-bus";
import type { ToolbarActionGroup } from "@fiftyone/components";
import { TemporalOverlay, useLighter } from "@fiftyone/lighter";
import { useModalSample } from "@fiftyone/state";
import { Icon, IconName, Size } from "@voxel51/voodo";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useMemo } from "react";
import { useLabelsContext } from "../../core/src/components/Modal/Sidebar/Annotate";
import { editing } from "../../core/src/components/Modal/Sidebar/Annotate/Edit";
import { frameAt } from "../../playback/src/lib/playback/utils";
import { usePlayhead } from "../../playback/src/lib/playback/use-playback-state";
import { useFrameLabelsStream } from "./frameLabelsStream";
import { resolvePropagationTarget } from "./propagationTarget";
import { selectedOverlayIds } from "./useLinkedOverlayState";

/** First sample-level field whose `_cls` is `TemporalDetections`. */
const firstTemporalDetectionFieldPath = (
  sample: Record<string, unknown> | null | undefined
): string | null => {
  if (!sample) return null;
  for (const [path, value] of Object.entries(sample)) {
    if (
      value &&
      typeof value === "object" &&
      (value as { _cls?: unknown })._cls === "TemporalDetections"
    ) {
      return path;
    }
  }
  return null;
};

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
  const { scene } = useLighter();
  const { addLabelToSidebar } = useLabelsContext();
  const setEditing = useSetAtom(editing);

  const tdFieldPath = useMemo(
    () =>
      firstTemporalDetectionFieldPath(
        (modalSample?.sample as Record<string, unknown>) ?? null
      ),
    [modalSample?.sample]
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
              : "No TemporalDetections field on this sample",
            isDisabled: !canCreateTd,
            onClick: async () => {
              if (!canCreateTd || !tdFieldPath || !fps) return;
              // Default: 1-second window starting at the playhead frame.
              const startFrame = frameAt(playhead, fps);
              const endFrame = startFrame + Math.round(fps);
              const detectionId = await bus.execute(
                new CreateTemporalDetectionCommand(tdFieldPath, [
                  startFrame,
                  endFrame,
                ])
              );
              if (!detectionId || !scene) return;
              // Mirror useCreate: register the new label with the sidebar and
              // open the edit form so the user can fill in label/attrs.
              const overlay = scene.getOverlay(
                `td-${tdFieldPath}-${detectionId}`
              );
              if (!(overlay instanceof TemporalOverlay)) return;
              const annotationLabel = {
                data: overlay.label,
                overlay,
                path: tdFieldPath,
                type: "TemporalDetection" as const,
              };
              addLabelToSidebar(annotationLabel);
              setEditing(atom(annotationLabel));
            },
          },
          {
            id: "propagate",
            label: "Propagate",
            icon: <Icon name={IconName.ContentCopy} size={Size.Sm} />,
            shortcut: "-",
            tooltip: target.ok
              ? `Interpolate frames ${target.fromFrame}–${target.toFrame}`
              : target.reason,
            isDisabled: !target.ok,
            onClick: () => {
              if (!target.ok) return;
              // Dispatch echo — the visible counterpart to debugging the
              // silent keybinding path.
              console.debug("[va-toolbar] propagate", {
                instanceId: target.instanceId,
                fromFrame: target.fromFrame,
                toFrame: target.toFrame,
              });
              void bus.execute(
                new PropagateCommand(
                  target.instanceId,
                  target.fromFrame,
                  target.toFrame,
                  "linear"
                )
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
              if (!target.ok) return;
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
