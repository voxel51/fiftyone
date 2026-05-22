import { createContext, useContext } from "react";
import type { VideoFrameLabelsStream } from "./VideoFrameLabelsStream";

/**
 * Shares the active frame-labels stream from the registrar component
 * down to downstream consumers (e.g. the per-class track builder) so we
 * don't issue duplicate `/frames` fetches against the same sample.
 *
 * Value is `null` while the stream's params (sampleId, duration, etc.)
 * aren't all available yet — consumers should treat that as "no data
 * available; render placeholder."
 */
export const FrameLabelsContext = createContext<VideoFrameLabelsStream | null>(
  null
);

export function useFrameLabelsStream(): VideoFrameLabelsStream | null {
  return useContext(FrameLabelsContext);
}
