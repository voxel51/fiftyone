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
import { useVideoFrameSource } from "../streams/videoFrameSource";
import { seedFrameStore } from "../utils/frameStoreSeed";
import { useCarriedFrameEdits } from "./useCarriedFrameEdits";
import { useOnSampleLevelLabelsChange } from "./useOnSampleLevelLabelsChange";

export interface SyncVideoStoreOptions {
  /** Frame fields to register, keyed to label type. */
  labelTypes: Record<string, LabelType>;
  /** Sample-level label paths whose resolution re-announces the sample-level backing. */
  sampleLevelPaths: ReadonlySet<string>;
  /** Frame-scoped primitive paths whose per-frame values the store serves. Default none. */
  valuePaths?: readonly string[];
}

/**
 * Own the video sample's engine store for the lifetime of the surface: a
 * composite {@link VideoLabelStore} of a {@link FrameStore} seeded from the
 * `/frames` stream plus a {@link SampleLabelStore} over the shared `Sample`.
 * Must be mounted under the modal scope where the labels stream is published.
 */
const NO_VALUE_PATHS: readonly string[] = [];

export const useSyncAnnotationVideoStore = ({
  labelTypes,
  sampleLevelPaths,
  valuePaths = NO_VALUE_PATHS,
}: SyncVideoStoreOptions): void => {
  const engine = useAnnotationEngine();
  const sampleId = useActiveSampleId();
  const getSample = useSampleInstanceGetter();
  const stream = useFrameLabelsStream();
  const frameSource = useVideoFrameSource();
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
    const frames = new FrameStore(sampleId, {
      labelTypes,
      valuePaths,
      loading: true,
      frameSource: frameSource ?? undefined,
    });
    const sampleLevel = new SampleLabelStore(sampleId, getSample(sampleId));
    const store = new VideoLabelStore(sampleId, frames, sampleLevel);
    const unregister = engine.registerStore(store);
    sampleLevelRef.current = sampleLevel;

    const stopSeeding = seedFrameStore(frames, stream, labelTypes, valuePaths);
    carry.restore(frames, sampleId);

    return () => {
      carry.stash(frames, sampleId);
      stopSeeding();
      unregister();
      sampleLevel.dispose();
      sampleLevelRef.current = null;
    };
  }, [
    engine,
    sampleId,
    labelTypes,
    valuePaths,
    getSample,
    stream,
    frameSource,
    carry,
  ]);

  // Once a sample-level label becomes resolvable (or its type settles), the
  // Lighter bridge mounts its overlay and the temporal view refreshes its
  // presence cache; the FrameStore announces frame fields itself.
  const resyncSampleLevel = useCallback(() => {
    sampleLevelRef.current?.resync();
  }, []);
  useOnSampleLevelLabelsChange(sampleId, sampleLevelPaths, resyncSampleLevel);
};
