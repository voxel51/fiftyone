import { AnnotationTopBar } from "@fiftyone/annotation";
import { useStream } from "@fiftyone/playback";
import type { ModalSample } from "@fiftyone/state";
import React from "react";
import { useModalSampleFrameRate } from "../state/accessors";
import type { ImaVidImageFrame } from "../streams/ImaVidImageStream";
import { IMAVID_STREAM_ID } from "../utils/ids";

/**
 * Video wiring for the shared {@link AnnotationTopBar}: fps from the modal
 * accessor, and for ImaVid the filename tracks the frame under the playhead
 * (the stream dedupes by frame number; absent — native video / pre-first
 * frame — it falls back to the modal sample's filepath). Must mount inside
 * the surface's PlaybackProvider.
 */
export const VideoAnnotationTopBar: React.FC<{ sample: ModalSample }> = ({
  sample,
}) => {
  const frameRate = useModalSampleFrameRate(sample);
  const frame = useStream<ImaVidImageFrame>(IMAVID_STREAM_ID);

  return (
    <AnnotationTopBar
      sample={sample}
      frameRate={frameRate}
      filepathOverride={frame?.meta?.filepath || undefined}
    />
  );
};
