import { useCurrentSampleId, useModalSample } from "@fiftyone/state";
import { atom, useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";
import { AnnotationEngine } from "../engine/core/engine";
import { SampleLabelStore } from "../engine/store/sampleLabelStore";
import { useSampleInstanceGetter } from "./useSample";

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
 * Mount once at the annotation root, after the sample-sync hooks (their effects
 * fill each Sample first, so a store never indexes the previous sample's data).
 */
export const useSyncAnnotationEngine = (): void => {
  const engine = useAnnotationEngine();
  const getSample = useSampleInstanceGetter();
  const modalId = useModalSample()?.sample?._id;
  const threeDId = useCurrentSampleId();

  // the modal's distinct sample documents — a grouped 2D + 3D modal renders
  // two at once (the selected slice and the pinned 3D scene); every other case
  // collapses to one, where the ids coincide
  const sampleIds = useMemo(() => {
    const ids = new Set<string>();

    if (modalId) {
      ids.add(modalId);
    }

    if (threeDId) {
      ids.add(threeDId);
    }

    return [...ids];
  }, [modalId, threeDId]);

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
