import { useAudioStream } from "@fiftyone/playback";
import type React from "react";
import { AUDIO_STREAM_ID } from "../utils/ids";

export interface RegisterTimelineAudioProps {
  /** Resolved source video URL, or null when the sample has none. */
  videoSrc: string | null;
  /** Demuxer verdict; undefined = unknown (element sniffing decides). */
  hasAudio?: boolean;
}

/**
 * Timeline audio for the frame-driven decode strategies, whose picture
 * pipelines produce silent bitmaps. The `html` strategy must not mount
 * this — its `<video>` already carries the audio.
 */
export const RegisterTimelineAudio: React.FC<RegisterTimelineAudioProps> = ({
  videoSrc,
  hasAudio,
}) => {
  useAudioStream(AUDIO_STREAM_ID, videoSrc ?? "", {
    enabled: Boolean(videoSrc) && hasAudio !== false,
  });
  return null;
};
