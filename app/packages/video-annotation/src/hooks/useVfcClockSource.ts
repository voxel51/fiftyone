import { useEffect, type RefObject } from "react";
import { usePlayback, usePresentedMediaTime } from "@fiftyone/playback";

/**
 * Register a `<video>` element's vfc-reported presentation time as the
 * playback engine's clock source. The clock reads `null` before the first
 * vfc tick lands, for which the engine falls back to its dt advance.
 */
export function useVfcClockSource(
  videoRef: RefObject<HTMLVideoElement | null>,
): void {
  const { setClockSource } = usePlayback();
  const presentedMediaTimeRef = usePresentedMediaTime(videoRef);

  useEffect(() => {
    return setClockSource({
      read: () => presentedMediaTimeRef.current,
    });
  }, [presentedMediaTimeRef, setClockSource]);
}
