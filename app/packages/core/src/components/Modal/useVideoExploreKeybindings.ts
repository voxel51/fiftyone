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
 * The looker bound `["+", "="]` and `["-", "_"]`. Each needs its own binding
 * here because the key matcher requires an EXACT modifier state — a shifted
 * press falls through a bare binding rather than matching it. `"\\+"` escapes
 * the reserved combiner and resolves to `=`; shift over that key is what
 * produces a literal `+` on a US layout.
 */
export const useVideoExploreKeybindings = () => {
  const { zoomIn, zoomOut } = useLighter();

  useKeyBindings(
    KnownContexts.Modal,
    [
      {
        commandId: "video-explore-zoom-in",
        sequence: "\\+",
        handler: zoomIn,
        label: "Zoom in",
        description: "Zoom into the video and its labels",
      },
      {
        commandId: "video-explore-zoom-in-shift",
        sequence: "shift+\\+",
        handler: zoomIn,
        label: "Zoom in",
        description: "Zoom into the video and its labels",
      },
      {
        commandId: "video-explore-zoom-out",
        sequence: "-",
        handler: zoomOut,
        label: "Zoom out",
        description: "Zoom out of the video and its labels",
      },
      {
        commandId: "video-explore-zoom-out-shift",
        sequence: "shift+-",
        handler: zoomOut,
        label: "Zoom out",
        description: "Zoom out of the video and its labels",
      },
    ],
    [zoomIn, zoomOut],
  );
};
