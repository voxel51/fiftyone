import { useCommandBus } from "@fiftyone/command-bus";
import { KnownContexts, useKeyBindings } from "@fiftyone/commands";
import { useLighter } from "@fiftyone/lighter";
import { useFrameLabelsStream } from "@fiftyone/video-annotation";
import { useRef } from "react";
import { frameAt } from "../../../playback/src/lib/playback/utils";
import { usePlayhead } from "../../../playback/src/lib/playback/use-playback-state";
import { MarkKeyframeCommand, PropagateCommand } from "../commands";

/**
 * Registers video-only keybindings into the modal-annotate context.
 * Must mount inside the video annotation surface's `<PlaybackProvider>`
 * because it reads `usePlayhead` to capture the user-visible time at
 * key-press. Composes with {@link useRegisterAnnotationKeybindings};
 * both can target the same context.
 */
export const useRegisterVideoAnnotationKeybindings = () => {
  const bus = useCommandBus();
  const { scene } = useLighter();
  const stream = useFrameLabelsStream();

  // Read the visual playhead, not `useCurrentTime` — currentTime lags
  // playhead while streams buffer, so dispatching at "the moment the
  // user pressed K" needs the visual position. Held in a ref so the
  // keybinding handler is rebuilt only when `scene` or `bus` change.
  const playhead = usePlayhead();
  const playheadRef = useRef(playhead);
  playheadRef.current = playhead;

  const streamRef = useRef(stream);
  streamRef.current = stream;

  useKeyBindings(
    KnownContexts.ModalAnnotate,
    [
      {
        commandId: "annotation-mark-keyframe",
        sequence: "k",
        handler: () => {
          if (!scene) return;
          const ids = scene.getSelectedOverlayIds();
          if (ids.length === 0) return;
          void bus.execute(
            new MarkKeyframeCommand(playheadRef.current, ids)
          );
        },
        label: "Mark keyframe",
        description:
          "Toggle the keyframe attribute on the selected detection at the current frame.",
      },
      {
        commandId: "annotation-propagate",
        sequence: "-",
        handler: () => {
          if (!scene) return;
          const s = streamRef.current;
          if (!s) return;
          const ids = scene.getSelectedOverlayIds();
          if (ids.length === 0) return;

          const currentFrame = frameAt(
            playheadRef.current,
            s.fps,
            s.totalFrames
          );
          const currentSnapshot = s.getValue(playheadRef.current);
          if (!currentSnapshot) return;

          const selected = currentSnapshot.detections.find((d) =>
            ids.includes(d.id)
          );
          const instanceId = selected?.instance?._id;
          if (!instanceId) return;

          // Walk the cached frames to locate the bracketing keyframes:
          // the most recent keyframe at or before the playhead, and the
          // next keyframe strictly after.
          let leftFrame: number | null = null;
          let rightFrame: number | null = null;
          for (let f = 1; f <= s.totalFrames; f++) {
            const snap = s.getValue((f - 1) / s.fps);
            if (!snap) continue;
            const det = snap.detections.find(
              (d) => d.keyframe && d.instance?._id === instanceId
            );
            if (!det) continue;
            if (f <= currentFrame) leftFrame = f;
            if (f > currentFrame && rightFrame === null) {
              rightFrame = f;
              break;
            }
          }
          if (leftFrame === null || rightFrame === null) return;

          void bus.execute(
            new PropagateCommand(instanceId, leftFrame, rightFrame, "linear")
          );
        },
        label: "Propagate",
        description:
          "Linearly interpolate the selected tracked object between its bracketing keyframes.",
      },
    ],
    [scene, bus]
  );
};
