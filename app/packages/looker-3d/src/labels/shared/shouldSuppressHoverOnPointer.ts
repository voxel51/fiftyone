import { PANEL_ID_MAIN } from "../../constants";
import type { HoveredLabelSource } from "../../types";

/**
 * Whether a pointer-over on a cuboid/polyline should be ignored rather than
 * setting hover state.
 *
 * `isCurrentlyTransforming` suppresses hover in every panel (main + both
 * ortho side panels) while a transform/face-resize drag is in progress, so
 * editing one label's geometry never highlights whatever other label the
 * cursor happens to pass over mid-drag (FOEPD-4280).
 *
 * The `buttons !== 0` check on `PANEL_ID_MAIN` alone is a separate,
 * pre-existing guard for the main view's point-cloud crop-drag tool, which
 * doesn't set `isCurrentlyTransforming` but still shouldn't cause incidental
 * hover while a mouse button is held down.
 */
export function shouldSuppressHoverOnPointer(
  hoverSource: HoveredLabelSource,
  isCurrentlyTransforming: boolean,
  buttons: number,
): boolean {
  return (
    isCurrentlyTransforming || (hoverSource === PANEL_ID_MAIN && buttons !== 0)
  );
}
