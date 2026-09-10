import {
  FrameStore,
  SampleLabelStore,
  useActiveSampleId,
  useAnnotationEngine,
  useSampleInstanceGetter,
  VideoLabelStore,
} from "@fiftyone/annotation";
import type { LabelType } from "@fiftyone/utilities";
import { useCallback, useEffect, useRef } from "react";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";
import { seedFrameStore } from "../utils/frameStoreSeed";
import { useCarriedFrameEdits } from "./useCarriedFrameEdits";
import { useOnSampleLevelLabelsChange } from "./useOnSampleLevelLabelsChange";

export interface SyncVideoStoreOptions {
  /** Frame fields to register, keyed to label type. */
  labelTypes: Record<string, LabelType>;
  /** Sample-level label paths whose resolution re-announces the sample-level backing. */
  sampleLevelPaths: ReadonlySet<string>;
  /** Fetch every frame up front for consumers that walk the whole clip; `warmupAll` competes with playback. Default `true`. */
  seedWholeClip?: boolean;
}

/**
 * Own the video sample's engine store for the lifetime of the surface: a
 * composite {@link VideoLabelStore} of a {@link FrameStore} seeded from the
 * `/frames` stream plus a {@link SampleLabelStore} over the shared `Sample`.
 * Must be mounted under the modal scope where the labels stream is published.
 */
export const useSyncAnnotationVideoStore = ({
  labelTypes,
  sampleLevelPaths,
  seedWholeClip = true,
}: SyncVideoStoreOptions): void => {
  const engine = useAnnotationEngine();
  const sampleId = useActiveSampleId();
  const getSample = useSampleInstanceGetter();
  const stream = useFrameLabelsStream();
  const carry = useCarriedFrameEdits();

  // The live sample-level backing, re-announced below without re-registering
  // the composite store.
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

  // Once a sample-level label becomes resolvable (or its type settles), the
  // Lighter bridge mounts its overlay and the temporal view refreshes its
  // presence cache; the FrameStore announces frame fields itself.
  const resyncSampleLevel = useCallback(() => {
    sampleLevelRef.current?.resync();
  }, []);
  useOnSampleLevelLabelsChange(sampleId, sampleLevelPaths, resyncSampleLevel);
};
