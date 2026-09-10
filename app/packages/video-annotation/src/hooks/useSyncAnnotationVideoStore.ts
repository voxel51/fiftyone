import {
  FrameStore,
  SampleLabelStore,
  useActiveSampleId,
  useAnnotationEngine,
  useSampleInstanceGetter,
  VideoLabelStore,
} from "@fiftyone/annotation";
import type { LabelType } from "@fiftyone/utilities";
import { useEffect, useRef } from "react";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";
import { useFrameLabelFields } from "../state/accessors";
import { seedFrameStore } from "../utils/frameStoreSeed";
import { useCarriedFrameEdits } from "./useCarriedFrameEdits";
import { useHydrateSampleLevelOverlays } from "./useHydrateSampleLevelOverlays";

/**
 * Own the video sample's engine store for the lifetime of the surface: a
 * composite {@link VideoLabelStore} of a {@link FrameStore} seeded from the
 * `/frames` stream plus a {@link SampleLabelStore} over the shared `Sample`.
 * Must be mounted under the modal scope where the labels stream is published.
 */
export const useSyncAnnotationVideoStore = (
  /** Frame fields to register, keyed to label type; Explore supplies its own because the annotation-schema default is empty outside Annotate. */
  labelTypesOverride?: Record<string, LabelType>,
  options: {
    /** Fetch every frame up front for consumers that walk the whole clip; Explore must not, since `warmupAll` competes with playback. */
    seedWholeClip?: boolean;
    /** Sample-level label paths the hydration nudge watches; Explore must supply its own since the default is empty outside Annotate. */
    sampleLevelPaths?: ReadonlySet<string>;
  } = {},
): void => {
  const seedWholeClip = options.seedWholeClip ?? true;
  const sampleLevelPathsOverride = options.sampleLevelPaths;
  const engine = useAnnotationEngine();
  const sampleId = useActiveSampleId();
  const getSample = useSampleInstanceGetter();
  const stream = useFrameLabelsStream();
  // Both are called unconditionally to keep hook order stable; the override
  // wins when a surface supplies one.
  const annotationLabelTypes = useFrameLabelFields();
  const labelTypes = labelTypesOverride ?? annotationLabelTypes;
  const carry = useCarriedFrameEdits();

  // The live sample-level backing, so the hydration nudge below can re-announce
  // it without re-registering the composite store.
  const sampleLevelRef = useRef<SampleLabelStore | null>(null);

  useEffect(() => {
    if (!sampleId || !stream) {
      return undefined;
    }

    // Not gated on active frame fields: the composite store also owns the
    // sample-level labels, so activation gates rendering, never the store
    const frames = new FrameStore(sampleId, { labelTypes, loading: true });
    const sampleLevel = new SampleLabelStore(sampleId, getSample(sampleId));
    const store = new VideoLabelStore(sampleId, frames, sampleLevel);
    const unregister = engine.registerStore(store);
    sampleLevelRef.current = sampleLevel;

    const stopSeeding = seedFrameStore(
      frames,
      stream,
      labelTypes,
      seedWholeClip,
    );
    carry.restore(frames, sampleId);

    return () => {
      carry.stash(frames, sampleId);
      stopSeeding();
      unregister();
      sampleLevel.dispose();
      sampleLevelRef.current = null;
    };
  }, [engine, sampleId, labelTypes, getSample, stream, seedWholeClip, carry]);

  useHydrateSampleLevelOverlays(
    engine,
    sampleId,
    sampleLevelRef,
    sampleLevelPathsOverride,
  );
};
