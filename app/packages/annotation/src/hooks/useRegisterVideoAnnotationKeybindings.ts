import { useCommandBus } from "@fiftyone/command-bus";
import { KnownContexts, useKeyBindings } from "@fiftyone/commands";
import { useLighter } from "@fiftyone/lighter";
import {
  resolvePropagationTarget,
  useFrameLabelsStream,
} from "@fiftyone/video-annotation";
import { useRef } from "react";
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
          void bus.execute(new MarkKeyframeCommand(playheadRef.current, ids));
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

          // Shared with the timeline toolbar so the two can't disagree
          // about when propagation is eligible or which keyframes bracket
          // the playhead.
          const target = resolvePropagationTarget(s, ids, playheadRef.current);
          if (!target.ok) return;

          void bus.execute(
            new PropagateCommand(
              target.instanceId,
              target.fromFrame,
              target.toFrame,
              "linear"
            )
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
