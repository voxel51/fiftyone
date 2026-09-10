import type { FrameStore } from "@fiftyone/annotation";
import type { LabelType } from "@fiftyone/utilities";
import type { useFrameLabelsStream } from "../streams/frameLabelsStream";
import { parseFramesData } from "../streams/framesData";

type FrameLabelsStream = NonNullable<ReturnType<typeof useFrameLabelsStream>>;

/**
 * Seed `frames` from the stream's cache, re-seed as chunks land or edits mutate
 * the cache, and settle the loading flag once data can be trusted. Returns the
 * teardown.
 */
export const seedFrameStore = (
  frames: FrameStore,
  stream: FrameLabelsStream,
  labelTypes: Record<string, LabelType>,
  seedWholeClip: boolean,
): (() => void) => {
  let torndown = false;
  const settle = () => {
    if (!torndown) {
      frames.setLoading(false);
    }
  };

  const seed = () =>
    frames.setData(parseFramesData(stream.cachedFrames(), labelTypes));
  const unsubscribe = stream.subscribeToEdits(() => {
    seed();
    settle();
  });
  seed();
  // an already-warm stream may never fire the subscription again, so cached
  // frames settle the loading state at once
  if (stream.cachedFrames().length > 0) {
    settle();
  }

  // Whole-clip seed for consumers that walk every frame; a read-only surface
  // has none and opts out. Resolution also settles the loading flag when no
  // chunk fires the edits subscription.
  if (seedWholeClip) {
    stream.warmupAll().then(settle, settle);
  }

  return () => {
    torndown = true;
    unsubscribe();
  };
};
