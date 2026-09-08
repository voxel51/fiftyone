import { KnownContexts, useKeyBindings } from "@fiftyone/commands";
import { useLighter } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";
import { useClearSelectedLabels } from "../Actions/Selected/hooks";

/**
 * Zoom and clear-selection keybindings for the video Explore surface.
 *
 * Space / `.` / `,` are NOT here — `TimelineControls` already registers
 * play-pause and frame stepping into this same context, and the modal itself
 * owns sample navigation, close, fullscreen and select. This hook covers what
 * the toolbar dropped (the looker's `+` / `-` zoom) and one rung of the
 * looker's Escape ladder.
 *
 * The looker bound `["+", "="]` and `["-", "_"]` against the produced
 * character alone. This matcher instead requires an EXACT modifier state, so
 * each character needs both a shifted and an unshifted binding to stay
 * layout-independent: on a US layout `+` and `_` are shifted presses, while on
 * layouts that give them their own cap they are not.
 */
export const useVideoExploreKeybindings = () => {
  const { zoomIn, zoomOut } = useLighter();
  const clearSelectedLabels = useClearSelectedLabels();
  // Read as a value so the hook re-renders when the selection empties or
  // fills: `useKeyBindings` re-reads the binding list every render, so the
  // enablement predicate below closes over a fresh answer each time.
  const hasSelection = fos.useSelectedLabelIds().size > 0;

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
      {
        // Escape's LAST rung before closing, which is where the looker put it
        // too: `actions.ts`'s escape handler dispatched `clear` whenever
        // `selectedLabels.length`, and only closed the modal on an empty
        // selection. Without this rung a user who has built up a selection
        // gets no way back out of it short of the menu, and Escape throws the
        // modal away while leaving the selection standing in state — where the
        // next sample's Tag would still act on it, since nothing clears the
        // atom on navigation.
        //
        // Expressed as priority + enablement rather than as a branch inside
        // one handler, because the close binding lives in `Modal.tsx` and this
        // surface must not reach into it: `KeyManager` picks the
        // highest-priority ENABLED command for a sequence, so with no
        // selection this rung is skipped and `ModalClose` runs untouched.
        commandId: "video-explore-clear-selection",
        sequence: "Escape",
        priority: 1,
        enablement: () => hasSelection,
        handler: clearSelectedLabels,
        label: "Clear selected labels",
        description: "Deselect every selected label",
      },
    ],
    [zoomIn, zoomOut, hasSelection, clearSelectedLabels],
  );
};
