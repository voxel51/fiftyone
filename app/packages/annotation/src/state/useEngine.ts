import { useIsImageDynamicGroupVideo, useModalSample } from "@fiftyone/state";
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
 * Register a {@link SampleLabelStore} for every sample the modal renders,
 * except video surfaces, which own their composite {@link VideoLabelStore}.
 * Mount once at the annotation root after the sample-sync hooks so a store
 * never indexes the previous sample's data.
 */
export const useSyncAnnotationEngine = (): void => {
  const engine = useAnnotationEngine();
  const getSample = useSampleInstanceGetter();
  const modalId = useActiveSampleId();
  const sceneId = useThreeDSceneSampleId();

  // Whether the SELECTED modal sample is a video — true for a video dataset or
  // a grouped dataset whose selected slice is a video sample. The dataset-level
  // media type is "group" for a group, so decide from the open sample (matches
  // ModalLooker's video-surface decision). The video surface owns that sample's
  // store, so the root must skip it in both cases.
  const modalSample = useModalSample();
  const isVideo =
    ((modalSample?.sample?.media_type as unknown as string) ??
      modalSample?.sample?._media_type) === "video";
  const isImageDynamicGroupVideo = useIsImageDynamicGroupVideo();

  // the modal's distinct sample documents — a grouped 2D + 3D modal renders
  // two at once (the selected slice and the pinned 3D scene, already guaranteed
  // distinct by useThreeDSceneSampleId); every other case collapses to one.
  // a video-surface selected slice is skipped; the video surface registers it
  const sampleIds = useMemo(() => {
    const ids: string[] = [];

    if (modalId && !isVideo && !isImageDynamicGroupVideo) {
      ids.push(modalId);
    }

    if (sceneId) {
      ids.push(sceneId);
    }

    return ids;
  }, [modalId, sceneId, isVideo, isImageDynamicGroupVideo]);

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
