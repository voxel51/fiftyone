/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { FrameStore } from "@fiftyone/annotation";
import type { LabelType } from "@fiftyone/utilities";
import type { useFrameLabelsStream } from "../streams/frameLabelsStream";
import { parseFramesData, parseFrameValues } from "../streams/framesData";

type FrameLabelsStream = NonNullable<ReturnType<typeof useFrameLabelsStream>>;

/**
 * Seed `frames` from the stream's cache, merge each window as it lands, drop
 * what the frame budget evicts, and settle the loading flag once data can be
 * trusted. Returns the teardown.
 */
export const seedFrameStore = (
  frames: FrameStore,
  stream: FrameLabelsStream,
  labelTypes: Record<string, LabelType>,
  valuePaths: readonly string[],
): (() => void) => {
  let torndown = false;
  const settle = () => {
    if (!torndown) {
      frames.setLoading(false);
    }
  };

  // The initial seed reads the whole cache: the stream may already hold
  // frames that landed before this store existed (a field toggle rebuilds the
  // store over a live stream).
  const seed = () => {
    const cached = stream.cachedFrames();
    frames.setData(
      parseFramesData(cached, labelTypes),
      parseFrameValues(cached, valuePaths),
    );
  };
  // A landed window merges only its own frames; re-reading the whole cache
  // per chunk made opening a clip quadratic.
  const seedRange = (range: [number, number]) => {
    const docs = stream.cachedFramesIn(range);
    frames.mergeData(
      parseFramesData(docs, labelTypes),
      parseFrameValues(docs, valuePaths),
    );
  };
  const unsubscribe = stream.subscribeToEdits((range) => {
    seedRange(range);
    settle();
  });
  const unsubscribeEvictions = stream.subscribeToEvictions((frame) => {
    frames.evict([frame]);
  });
  seed();
  // an already-warm stream may never fire the subscription again, so cached
  // frames settle the loading state at once
  if (stream.cachedFrames().length > 0) {
    settle();
  }

  return () => {
    torndown = true;
    unsubscribe();
    unsubscribeEvictions();
  };
};
