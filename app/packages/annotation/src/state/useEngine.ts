import { useIsVideo } from "@fiftyone/state";
import { atom, useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";
import { AnnotationEngine } from "../engine/core/engine";
import { SampleLabelStore } from "../engine/store/sampleLabelStore";
import { useThreeDSceneSampleId } from "./useGroupAnnotationSample";
import { useActiveSampleId, useSampleInstanceGetter } from "./useSample";

/**
 * Shared {@link AnnotationEngine} for the annotation session.
 *
 * Session-singleton like the shared {@link Sample}: surfaces and selector
 * hooks receive it through {@link useAnnotationEngine} (the binding-agent
 * hook — engine hooks themselves are DI-style and take it as an argument).
 * Store lifecycle is owned by {@link useSyncAnnotationEngine}.
 */
const engineAtom = atom(new AnnotationEngine());

/** Get the shared {@link AnnotationEngine}. Stable across renders. */
export const useAnnotationEngine = (): AnnotationEngine =>
  useAtomValue(engineAtom);

/**
 * Own the engine's store lifecycle for the modal: register a
 * {@link SampleLabelStore} over the {@link Sample} of every sample the modal
 * renders — the selected slice, plus the pinned 3D slice when a grouped modal
 * shows both (they are distinct sample documents, federated by the engine and
 * addressed by `LabelRef.sample`). Re-register when that set changes.
 *
 * Unregistration sweeps engine-owned ephemera (selection, hover, undo) for the
 * departed sample — sample-switch deselection lives there, not here.
 *
 * A video sample is the exception: its store is the composite
 * {@link VideoLabelStore} (frame-detections + sample-level), owned and seeded by
 * the video surface from its `/frames` source. The engine federates one store
 * per sample, so this hook leaves the video sample alone.
 *
 * Mount once at the annotation root, after the sample-sync hooks (their effects
 * fill each Sample first, so a store never indexes the previous sample's data).
 */
export const useSyncAnnotationEngine = (): void => {
  const engine = useAnnotationEngine();
  const getSample = useSampleInstanceGetter();
  const modalId = useActiveSampleId();
  const sceneId = useThreeDSceneSampleId();
  const isVideo = useIsVideo();

  // the modal's distinct sample documents — a grouped 2D + 3D modal renders
  // two at once (the selected slice and the pinned 3D scene, already guaranteed
  // distinct by useThreeDSceneSampleId); every other case collapses to one.
  // A video selected slice is skipped — the video surface registers it.
  const sampleIds = useMemo(() => {
    const ids: string[] = [];

    if (modalId && !isVideo) {
      ids.push(modalId);
    }

    if (sceneId) {
      ids.push(sceneId);
    }

    return ids;
  }, [modalId, sceneId, isVideo]);

  useEffect(() => {
    if (sampleIds.length === 0) {
      return undefined;
    }

    const teardown = sampleIds.map((id) => {
      const store = new SampleLabelStore(id, getSample(id));
      const unregister = engine.registerStore(store);

      return () => {
        unregister();
        store.dispose();
      };
    });

    return () => teardown.forEach((detach) => detach());
  }, [engine, getSample, sampleIds]);
};
