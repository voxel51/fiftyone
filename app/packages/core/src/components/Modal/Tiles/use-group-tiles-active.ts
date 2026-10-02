import * as fos from "@fiftyone/state";

/**
 * Whether the group sample view is rendered on the tiling host. Explore mode
 * only for now: annotate mode's visibility controller still drives the
 * legacy visibility atoms directly, so it keeps the legacy split view.
 */
export function useGroupTilesActive(): boolean {
  const isGroup = fos.useIsGroupDataset();
  const mode = fos.useModalMode();
  return isGroup && mode === fos.ModalMode.EXPLORE;
}

/**
 * Whether tile presence (not the visibility popout) decides which group
 * content is shown. Dynamic groups host the whole legacy tree in one tile
 * and keep the popout.
 */
export function useGroupTilesOwnVisibility(): boolean {
  const active = useGroupTilesActive();
  const dynamic = fos.useIsDynamicGroup();
  return active && !dynamic;
}
