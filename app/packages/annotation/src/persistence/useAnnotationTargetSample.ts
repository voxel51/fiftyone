import {
  type ModalSample,
  useIsGroupMain2dViewerVisible,
  useModalSample,
  useStableSceneSample3d,
} from "@fiftyone/state";

/**
 * The sample the user is currently annotating.
 *
 * In a grouped modal the 3D viewer renders a different slice's sample (e.g. a
 * pcd) than the 2D viewer (e.g. an image). Whichever viewer is the active
 * annotation surface determines which sample an edit — canvas cuboid or
 * sidebar field — belongs to. Resolving this to the 2D modal sample for a 3D
 * edit writes the label onto the wrong slice's sample (data corruption) and
 * leaves the pcd's edit unpersisted (lost on refresh), so this MUST be used
 * wherever an annotation delta is built or recorded.
 */
export const useAnnotationTargetSample = ():
  | ModalSample["sample"]
  | undefined => {
  const main2dVisible = useIsGroupMain2dViewerVisible();
  const modalSample = useModalSample()?.sample;
  const sceneSample = useStableSceneSample3d()?.sample;
  return main2dVisible ? modalSample : sceneSample ?? modalSample;
};
