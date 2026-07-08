import { createStreamHandle } from "./createStreamHandle";
import type { VideoFrameLabelsStream } from "./VideoFrameLabelsStream";

const { useStream, usePublishStream } =
  createStreamHandle<VideoFrameLabelsStream>();

/**
 * Active frame-labels stream; publication goes through
 * {@link usePublishFrameLabelsStream} so external code can't write arbitrary
 * values.
 *
 * `null` while the stream's params (sampleId, duration, etc.) aren't all
 * available yet — consumers should treat that as "no data available; render
 * placeholder."
 */
export const useFrameLabelsStream = useStream;

/**
 * Publishes `stream` as the active frame-labels stream for the lifetime of
 * the calling component, clearing on unmount. Intended for the labels
 * registrar; nothing else should be publishing.
 */
export const usePublishFrameLabelsStream = usePublishStream;
