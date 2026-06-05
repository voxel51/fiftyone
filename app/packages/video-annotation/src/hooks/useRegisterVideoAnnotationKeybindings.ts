import { MarkKeyframeCommand } from "@fiftyone/annotation";
import { useCommandBus } from "@fiftyone/command-bus";
import { KnownContexts, useKeyBindings } from "@fiftyone/commands";
import { useLighter } from "@fiftyone/lighter";
import { useRef } from "react";
import { usePlayhead } from "../../../playback/src/lib/playback/use-playback-state";

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

  // Read the visual playhead, not `useCurrentTime` — currentTime lags
  // playhead while streams buffer, so dispatching at "the moment the
  // user pressed K" needs the visual position. Held in a ref so the
  // keybinding handler is rebuilt only when `scene` or `bus` change.
  const playhead = usePlayhead();
  const playheadRef = useRef(playhead);
  playheadRef.current = playhead;

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
    ],
    [scene, bus]
  );
};
