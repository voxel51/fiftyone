import {
  FrameStore,
  SampleLabelStore,
  useActiveSampleId,
  useAnnotationEngine,
  useSampleInstanceGetter,
  VideoLabelStore,
} from "@fiftyone/annotation";
import { LabelType } from "@fiftyone/utilities";
import { useEffect } from "react";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";
import { parseFramesData } from "../streams/framesData";

/**
 * Own the video sample's engine store for the lifetime of the surface.
 *
 * The engine federates one {@link LabelStore} per sample, so a video sample
 * registers a composite {@link VideoLabelStore} — a {@link FrameStore} for the
 * per-frame detections plus a {@link SampleLabelStore} (over the shared
 * `Sample`) for sample-level labels. The annotation root's
 * `useSyncAnnotationEngine` skips the video sample precisely so this hook can
 * own it.
 *
 * The frame backing is seeded from the active `/frames` stream and re-seeded as
 * chunks land or local edits mutate the cache (via `subscribeToEdits`).
 *
 * Must be mounted under the modal scope where the labels stream is published.
 */
export const useSyncAnnotationVideoStore = (): void => {
  const engine = useAnnotationEngine();
  const sampleId = useActiveSampleId();
  const getSample = useSampleInstanceGetter();
  const stream = useFrameLabelsStream();
  const field = stream?.labelsField;

  useEffect(() => {
    if (!sampleId || !stream || !field) {
      return undefined;
    }

    const path = `frames.${field}`;
    const frames = new FrameStore(sampleId, {
      labelTypes: { [path]: LabelType.Detections },
    });
    const sampleLevel = new SampleLabelStore(sampleId, getSample(sampleId));
    const store = new VideoLabelStore(sampleId, frames, sampleLevel);
    const unregister = engine.registerStore(store);

    const seed = () =>
      frames.setData(parseFramesData(stream.cachedFrames(), field));
    const unsubscribe = stream.subscribeToEdits(seed);
    seed();

    // Whole-clip seed for engine consumers that still walk every frame
    // (propagation, interpolation, track ops). The timeline no longer needs
    // it — it reads the server index. Retire once those ops fetch per-range.
    void stream.warmupAll();

    return () => {
      unsubscribe();
      unregister();
      sampleLevel.dispose();
    };
  }, [engine, sampleId, field, getSample, stream]);
};
