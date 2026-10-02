import * as fos from "@fiftyone/state";
import { MEDIA_TYPE_MULTIMODAL } from "@fiftyone/utilities";

/**
 * Whether the sample view body is the tiling host. Everything but
 * multimodal: the episode renderer brings its own tiling shell and header.
 */
export function useSampleTilesActive(): boolean {
  return !fos.useIsMediaType(MEDIA_TYPE_MULTIMODAL);
}

/**
 * Whether tile presence (not the visibility popout) decides which group
 * content is shown: a regular group in explore mode. Dynamic groups and
 * annotate mode host the legacy group tree as one sample tile, where the
 * popout and the annotate-mode controller still drive the atoms.
 */
export function useGroupTilesOwnVisibility(): boolean {
  const isGroup = fos.useIsGroupDataset();
  const dynamic = fos.useIsDynamicGroup();
  const annotate = fos.useModalMode() === fos.ModalMode.ANNOTATE;
  return isGroup && !dynamic && !annotate;
}
