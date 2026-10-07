import { atom, useAtom } from "jotai";

type VideoTimelineDisplay = "configured" | "duration";

const videoTimelineDisplayAtom = atom<VideoTimelineDisplay>("duration");

/**
 * The modal video timeline's time-vs-frame-number readout choice. The
 * surfaces remount their `PlaybackProvider` per sample, so the choice is held
 * here and seeds each new mount.
 */
export const useVideoTimelineDisplay = () => {
  const [defaultDisplay, onDisplayChange] = useAtom(videoTimelineDisplayAtom);
  return { defaultDisplay, onDisplayChange };
};
