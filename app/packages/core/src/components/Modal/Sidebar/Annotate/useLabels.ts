import {
  useActiveAnnotationSampleId,
  useAnnotationEngine,
  useSampleSelector,
} from "@fiftyone/annotation";
import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { LabelsState, labelsState } from "./labelsAtoms";
import { activeLabelSchemas, visibleLabelSchemas } from "./state";
import { usePatchLabelEntrance } from "./usePatchLabelEntrance";
import { useReconcileLabels } from "./useReconcileLabels";

export {
  LabelsState,
  addLabel,
  labelAtoms,
  labelMap,
  labels,
  labelsByPath,
  labelsState,
} from "./labelsAtoms";
export {
  type LabelsContext,
  useGetSidebarLabels,
  useLabelsContext,
} from "./useLabelsContext";

/**
 * The sidebar label list is ready once label schemas are fetched and the
 * active annotation sample's data has hydrated. Until then, empty present
 * reads mean "loading", not "no labels".
 */
export const useAnnotationLabelsReady = (): boolean => {
  const schemasLoaded = useAtomValue(activeLabelSchemas) !== null;
  const sampleId = useActiveAnnotationSampleId();
  const hydrated = useSampleSelector(
    (s) => (s.getData() as { _id?: string })._id === sampleId,
    sampleId,
  );
  return schemasLoaded && Boolean(sampleId) && hydrated;
};

/**
 * The sidebar label list, derived from the annotation engine into the
 * transitional `labels` atom. Re-derives on every engine tick and on
 * `lighter:overlay-added`, since gated mask mounts insert without an engine
 * change.
 */
export default function useLabels() {
  const engine = useAnnotationEngine();
  const { scene } = useLighter();
  const active = useAtomValue(visibleLabelSchemas);
  const setLoading = useSetAtom(labelsState);
  const sampleId = useActiveAnnotationSampleId();

  const reconcile = useReconcileLabels({ engine, scene, active, sampleId });
  const maybeEnterPatchLabel = usePatchLabelEntrance({
    engine,
    active,
    sampleId,
  });

  // first hydration per sample: loading gate (one-shot per sample)
  const completedFor = useRef<string | null>(null);

  useEffect(() => {
    if (completedFor.current !== sampleId) {
      completedFor.current = null;
      setLoading(sampleId ? LabelsState.LOADING : LabelsState.UNSET);
    }
  }, [sampleId, setLoading]);

  useEffect(() => {
    reconcile();
    maybeEnterPatchLabel();

    // completeness keys on the engine, never on a surface being mounted; a 3D
    // slice has no Lighter scene
    if (completedFor.current !== sampleId && sampleId && active) {
      completedFor.current = sampleId;
      setLoading(LabelsState.COMPLETE);
    }

    return engine.subscribe(() => {
      reconcile();
      maybeEnterPatchLabel();
    });
  }, [active, engine, maybeEnterPatchLabel, reconcile, sampleId, setLoading]);

  // gated mounts insert without an engine change
  const on = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID,
  );
  on(
    "lighter:overlay-added",
    useCallback(() => reconcile(), [reconcile]),
  );
}
