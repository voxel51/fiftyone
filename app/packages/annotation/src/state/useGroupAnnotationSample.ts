import { useCurrentSampleId, useStableSceneSample3d } from "@fiftyone/state";
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

  return sceneId && sceneId !== modalId ? sceneId : undefined;
};

/**
 * The sample whose labels the annotation sidebar reflects: the pinned 3D scene
 * when its slice is the active selection, otherwise the selected 2D slice.
 *
 * The ONLY group-aware resolver — consumed by the sidebar list
 * ({@link useLabels}) and the sidebar edit refs, never the foundation.
 * `currentSampleId` is used purely as an equality discriminator against the
 * stable scene id ("is the 3D slice the active selection?"), never as a key.
 */
export const useActiveAnnotationSampleId = (): string => {
  const sceneId = useThreeDSceneSampleId();
  const currentId = useCurrentSampleId();
  const modalId = useActiveSampleId();

  return sceneId && currentId === sceneId ? sceneId : modalId;
};
