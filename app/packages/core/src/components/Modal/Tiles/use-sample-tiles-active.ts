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
 * Whether the group is laid out as separate tiles (carousel, media, 3D) and
 * tile presence, not the visibility popout, decides which group content is
 * shown. That is a regular group in explore mode, or a dynamic group over a
 * sliced dataset paged element by element (the paginator sits in the host
 * footer). ImaVid's frame-sequence mode, dynamic groups without slices and
 * annotate mode host the legacy group tree as one sample tile, where the
 * popout and the annotate-mode controller still drive the atoms.
 */
export function useGroupTilesOwnVisibility(): boolean {
  const isGroup = fos.useIsGroupDataset();
  const dynamic = fos.useIsDynamicGroup();
  const nested = fos.useIsNestedDynamicGroup();
  const imaVid = fos.useShouldRenderImaVidLooker(true);
  const annotate = fos.useModalMode() === fos.ModalMode.ANNOTATE;
  return isGroup && !annotate && (!dynamic || (nested && !imaVid));
}
