import { useModalSample } from "@fiftyone/state";
import { atom, useAtomValue } from "jotai";
import { useEffect } from "react";
import { AnnotationEngine } from "../engine/core/engine";
import { SampleLabelStore } from "../engine/store/sampleLabelStore";
import { useSampleInstance } from "./useSample";

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
 * Own the engine's store lifecycle for the modal sample: register a
 * {@link SampleLabelStore} keyed by the current sample id over the shared
 * {@link Sample}, and re-key it when the modal sample changes.
 *
 * Unregistration sweeps engine-owned ephemera (selection, hover, undo) for
 * the departed sample — sample-switch deselection lives there, not here.
 *
 * Mount once at the annotation root, after {@link useSyncModalSample} (its
 * effects clear and refill the shared Sample first, so the store never
 * indexes the previous sample's data under the new id).
 */
export const useSyncAnnotationEngine = (): void => {
  const engine = useAnnotationEngine();
  const sample = useSampleInstance();
  const modalSample = useModalSample();

  const sampleId = modalSample?.sample?._id;

  useEffect(() => {
    if (!sampleId) {
      return undefined;
    }

    const store = new SampleLabelStore(sampleId, sample);
    const unregister = engine.registerStore(store);

    return () => {
      unregister();
      store.dispose();
    };
  }, [engine, sample, sampleId]);
};
