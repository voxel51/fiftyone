import {
  groupMediaIsMain2DViewerVisible,
  useStableSceneSample3d,
} from "@fiftyone/state";
import { useRecoilValue } from "recoil";
import { useActiveSampleId } from "./useSample";

/**
 * The 3D scene's OWN sample id — the document rendered in the 3D viewer —
 * stable across 2D-slice selection; `undefined` before the 3D group query
 * settles.
 *
 * Sourced from the STABLE (Loadable) scene-sample selector: it never suspends,
 * so consumers render immediately and pick up the scene once its query lands.
 * The suspending `useSceneSample3d`/`useInteraction3dSample` here would block
 * the whole sidebar and hang the modal on "Pixelating…".
 *
 * Single raw source of truth for "which sample is the 3D scene" — the bridge
 * keys its writes off this directly; {@link useThreeDSceneSampleId} narrows it
 * to the grouped-distinct case for store registration.
 *
 * MUST stay out of the foundational `useSample*` accessors (it reads 3D modal
 * state) — wiring 3D selectors into those put GraphQL on the core load path and
 * hung the modal.
 */
export const useSceneSampleId = (): string | undefined =>
  useStableSceneSample3d()?.sample?._id;

/**
 * The scene's sample id WHEN it is a distinct document from the selected 2D
 * slice — i.e. a grouped 2D+3D modal; `undefined` otherwise (a non-grouped 3D
 * sample, a 2D-only modal, or before the scene query settles).
 *
 * Used to register the scene as a SECOND engine store, route its persistence,
 * and discriminate the sidebar's active slice. When it is `undefined` the
 * scene's id coincides with the selected slice (or is unknown) and
 * {@link useSyncModalSample} owns the single Sample.
 */
export const useThreeDSceneSampleId = (): string | undefined => {
  const sceneId = useSceneSampleId();
  const modalId = useActiveSampleId();

  // Require a known `modalId`: during modal navigation it blanks for a tick
  // while the stable scene selector still resolves to the active (non-3D)
  // sample, and `sceneId !== modalId` would then treat that sample as a
  // distinct scene to register — colliding with the surface's own store (e.g. a
  // video sample's VideoLabelStore).
  return sceneId && modalId && sceneId !== modalId ? sceneId : undefined;
};

/**
 * The sample whose labels the annotation sidebar reflects: the 3D scene when
 * it's the active surface, otherwise the selected 2D slice. The only
 * group-aware resolver — consumed by the sidebar list ({@link useLabels}) and
 * edit refs, never the foundation.
 *
 * Keys on which viewer is rendering (`groupMediaIsMain2DViewerVisible`, the
 * same signal `useFo3dPanelRouting` uses), not on the 3D pin: pinning the 3D
 * viewer to annotate a 2D slice makes the scene `currentSampleId` while the 2D
 * slice is the real surface, which would leak the scene's cuboids into the 2D
 * sidebar.
 */
export const useActiveAnnotationSampleId = (): string => {
  const sceneId = useThreeDSceneSampleId();
  const modalId = useActiveSampleId();

  const annotating2dSlice = useRecoilValue(groupMediaIsMain2DViewerVisible);

  return sceneId && !annotating2dSlice ? sceneId : modalId;
};
