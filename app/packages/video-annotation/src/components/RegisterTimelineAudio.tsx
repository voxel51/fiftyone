import { useAudioStream } from "@fiftyone/playback";
import type React from "react";
import { AUDIO_STREAM_ID } from "../utils/ids";

export interface RegisterTimelineAudioProps {
  /** Resolved source video URL, or null when the sample has no media URL. */
  videoSrc: string | null;
  /**
   * Audio-track presence from the decode-strategy probe's demuxed `moov`.
   * Undefined = unknown (probe skipped or failed): the stream mounts and
   * falls back to its own element sniffing.
   */
  hasAudio?: boolean;
}

/**
 * Timeline audio for the frame-driven decode strategies (`extract` /
 * `fetch`), where the picture pipeline produces silent bitmaps and sound
 * needs its own element on the source video. The `html` strategy must NOT
 * mount this — its `<video>` already carries the audio track
 * (`useMediaElementAudio` in `VideoLighterTile`), and a second element on
 * the same URL would double-fetch and double-play.
 *
 * `enabled` prefers the demuxer verdict: a conclusive "no audio track"
 * (or no reachable source video at all — frame-image-only datasets) never
 * creates an element, so those timelines show no volume UI and pay no
 * playback cost.
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
