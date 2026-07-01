import {
  type MediaBitmap,
  useSampleDescriptor,
  useSetSegmentBitmapSource,
} from "@fiftyone/annotation";
import { useCallback } from "react";
import { useImaVidImageStream } from "../streams/imaVidImageStreamHandle";
import { useCurrentFrameGetter } from "../state/useCurrentFrame";

/**
 * Register the active ImaVid frame as the browser SAM2 agent's bitmap source so
 * interactive click-to-segment runs on the decoded frame the surface already
 * holds — not the sample's `mediaUrl`, which for a video is the container file
 * (decoding it as an image fails). Mirrors the propagation path's
 * `getFrameBitmap`; the per-frame cache key matches it too, so an interactive
 * segment and a propagation run share the encoder embedding for a frame.
 *
 * Resolves live at inference time (reads the playhead frame on call), and
 * no-ops to `null` until the stream + a real frame are available, in which case
 * the agent falls back to the URL path.
 *
 * **Mount once** in the video surface, inside the `<PlaybackProvider>`.
 */
export const useRegisterVideoSegmentBitmap = (): void => {
  const imageStream = useImaVidImageStream();
  const getFrame = useCurrentFrameGetter();
  const { sampleId } = useSampleDescriptor();

  const resolve = useCallback(async (): Promise<MediaBitmap | null> => {
    if (!imageStream) {
      return null;
    }

    const frameNumber = getFrame();

    if (!Number.isFinite(frameNumber) || frameNumber < 1) {
      return null;
    }

    const time = (frameNumber - 1) / imageStream.fps;
    await imageStream.warmup(time);
    const frame = imageStream.getValue(time);

    if (!frame) {
      return null;
    }

    return {
      bitmap: frame.bitmap,
      cacheKey: `${sampleId}#frame=${frameNumber}`,
    };
  }, [imageStream, getFrame, sampleId]);

  useSetSegmentBitmapSource(resolve);
};
