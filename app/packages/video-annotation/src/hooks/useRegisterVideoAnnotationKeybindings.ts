import { KnownContexts, useKeyBindings } from "@fiftyone/commands";
import { useLighter } from "@fiftyone/lighter";
import { useRef } from "react";
import { useCurrentFrameGetter } from "../state/useCurrentFrame";
import { useSelectionIsKeyframeable } from "../state/useVideoSelection";
import { useVideoSurfaceActions } from "./useVideoSurfaceActions";

/**
 * Registers video-only keybindings into the modal-annotate context.
 * Must mount inside the video annotation surface's `<PlaybackProvider>`
 * because it reads the presented frame at key-press. Composes with
 * {@link useRegisterAnnotationKeybindings}; both can target the same
 * context.
 */
export const useRegisterVideoAnnotationKeybindings = () => {
  const actions = useVideoSurfaceActions();
  const { scene } = useLighter();

  // Same type gate the Mark Keyframe toolbar button uses — keyframes are
  // detections-only, so K no-ops on a TD / classification / polyline selection.
  const selectionIsKeyframeable = useSelectionIsKeyframeable();
  const keyframeableRef = useRef(selectionIsKeyframeable);
  keyframeableRef.current = selectionIsKeyframeable;

  // The presented frame — the one the overlays and the toolbar's keyframe
  // state describe — so K marks what the user is looking at.
  const getFrame = useCurrentFrameGetter();

  useKeyBindings(
    KnownContexts.ModalAnnotate,
    [
      {
        commandId: "annotation-mark-keyframe",
        sequence: "k",
        handler: () => {
          if (!scene) {
            return;
          }

          const ids = scene.getSelectedOverlayIds();

          if (ids.length === 0 || !keyframeableRef.current) {
            return;
          }

          actions.markKeyframe(getFrame(), ids);
        },
        label: "Mark keyframe",
        description:
          "Toggle the keyframe attribute on the selected detection at the current frame.",
      },
    ],
    [scene, actions],
  );
};
