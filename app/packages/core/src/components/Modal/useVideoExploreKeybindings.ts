import { KnownContexts, useKeyBindings } from "@fiftyone/commands";
import { useLighter } from "@fiftyone/lighter";

/**
 * Zoom keybindings for the video Explore surface.
 *
 * Space / `.` / `,` are NOT here — `TimelineControls` already registers
 * play-pause and frame stepping into this same context, and the modal itself
 * owns sample navigation, close, fullscreen and select. This hook covers only
 * what the toolbar dropped: the looker's `+` / `-` zoom.
 *
 * The looker bound `["+", "="]` and `["-", "_"]` against the produced
 * character alone. This matcher instead requires an EXACT modifier state, so
 * each character needs both a shifted and an unshifted binding to stay
 * layout-independent: on a US layout `+` and `_` are shifted presses, while on
 * layouts that give them their own cap they are not.
 */
export const useVideoExploreKeybindings = () => {
  const { zoomIn, zoomOut } = useLighter();

  useKeyBindings(
    KnownContexts.Modal,
    [
      {
        commandId: "video-explore-zoom-in",
        sequence: ["=", "\\+", "shift+\\+"],
        handler: zoomIn,
        label: "Zoom in",
        description: "Zoom into the video and its labels",
      },
      {
        commandId: "video-explore-zoom-out",
        sequence: ["-", "_", "shift+_"],
        handler: zoomOut,
        label: "Zoom out",
        description: "Zoom out of the video and its labels",
      },
    ],
    [zoomIn, zoomOut],
  );
};
