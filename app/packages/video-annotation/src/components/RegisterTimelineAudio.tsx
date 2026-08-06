import { useAudioStream } from "@fiftyone/playback";
import type React from "react";
import { AUDIO_STREAM_ID } from "../utils/ids";

export interface RegisterTimelineAudioProps {
  /** Resolved source video URL, or null when the sample has none. */
  videoSrc: string | null;
  /** Demuxer verdict; undefined = unknown (element sniffing decides). */
  hasAudio?: boolean;
}

/** The timeline's audio stream — the only source of sound. */
export const RegisterTimelineAudio: React.FC<RegisterTimelineAudioProps> = ({
  videoSrc,
  hasAudio,
}) => {
  useAudioStream(AUDIO_STREAM_ID, videoSrc ?? "", {
    enabled: Boolean(videoSrc) && hasAudio !== false,
  });
  return null;
};
