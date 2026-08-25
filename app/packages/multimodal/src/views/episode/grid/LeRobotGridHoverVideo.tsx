import { getFetchUrl } from "@fiftyone/utilities";
import { useEffect, useRef } from "react";

import type { EpisodePreviewNativeVideo } from "../../../ir";
import classes from "./GridRenderer.module.css";

type VideoFrameCallback = (
  now: number,
  metadata: { readonly mediaTime: number },
) => void;

type VideoWithFrameCallbacks = HTMLVideoElement & {
  cancelVideoFrameCallback?: (handle: number) => void;
  requestVideoFrameCallback?: (callback: VideoFrameCallback) => number;
};

/** Native MP4 hover surface constrained to one LeRobot episode interval. */
export function LeRobotGridHoverVideo({
  video,
}: {
  readonly video: EpisodePreviewNativeVideo;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { endTimeSeconds, startTimeSeconds } = video;
  const sourceUrl = getFetchUrl(video.source.url);

  // This effect owns the native media lifecycle for exactly one hover. It
  // seeks into the shared MP4, loops before the adjacent episode, and drops
  // the source on cleanup so rapid hover changes cannot retain old work.
  useEffect(() => {
    const element = videoRef.current as VideoWithFrameCallbacks | null;
    if (!element) return undefined;

    const requestFrame = element.requestVideoFrameCallback;
    const cancelFrame = element.cancelVideoFrameCallback;
    const supportsFrameCallbacks = typeof requestFrame === "function";
    let disposed = false;
    let failed = false;
    let frameHandle: number | null = null;
    let playGeneration = 0;
    let showingVideo = false;
    element.style.visibility = "hidden";

    const setShowingVideo = (showing: boolean) => {
      if (showingVideo === showing) return;
      showingVideo = showing;
      element.style.visibility = showing ? "visible" : "hidden";
    };
    const inEpisode = (timeSeconds: number) =>
      timeSeconds >= startTimeSeconds && timeSeconds < endTimeSeconds;
    const cancelPendingFrame = () => {
      const handle = frameHandle;
      frameHandle = null;
      if (handle !== null && typeof cancelFrame === "function") {
        cancelFrame.call(element, handle);
      }
    };
    const scheduleFrame = () => {
      if (
        disposed ||
        frameHandle !== null ||
        typeof requestFrame !== "function"
      ) {
        return;
      }
      frameHandle = requestFrame.call(element, onPresentedFrame);
    };
    const play = () => {
      const generation = ++playGeneration;
      void element.play().catch(() => {
        if (!disposed && generation === playGeneration) {
          setShowingVideo(false);
        }
      });
    };
    const playFromEpisodeStart = () => {
      if (disposed || failed) return;
      setShowingVideo(false);
      cancelPendingFrame();
      element.pause();
      element.currentTime = startTimeSeconds;
      scheduleFrame();
      play();
    };
    const presentFallbackFrame = () => {
      if (!supportsFrameCallbacks && inEpisode(element.currentTime)) {
        setShowingVideo(true);
      }
    };
    const onTimeUpdate = () => {
      if (element.currentTime >= endTimeSeconds) {
        playFromEpisodeStart();
      } else if (element.currentTime < startTimeSeconds) {
        setShowingVideo(false);
      } else {
        presentFallbackFrame();
      }
    };
    const onError = () => {
      failed = true;
      playGeneration += 1;
      setShowingVideo(false);
      cancelPendingFrame();
      element.pause();
    };

    function onPresentedFrame(
      _now: number,
      metadata: { readonly mediaTime: number },
    ) {
      frameHandle = null;
      if (disposed) return;
      if (metadata.mediaTime >= endTimeSeconds) {
        playFromEpisodeStart();
        return;
      }
      setShowingVideo(inEpisode(metadata.mediaTime));
      scheduleFrame();
    }

    element.addEventListener("ended", playFromEpisodeStart);
    element.addEventListener("error", onError);
    element.addEventListener("loadeddata", presentFallbackFrame);
    element.addEventListener("loadedmetadata", playFromEpisodeStart);
    element.addEventListener("seeked", presentFallbackFrame);
    element.addEventListener("timeupdate", onTimeUpdate);
    setShowingVideo(false);
    if (element.getAttribute("src") !== sourceUrl) {
      element.setAttribute("src", sourceUrl);
      element.load();
    }

    if (element.readyState >= 1) {
      playFromEpisodeStart();
    }

    return () => {
      disposed = true;
      playGeneration += 1;
      cancelPendingFrame();
      element.removeEventListener("ended", playFromEpisodeStart);
      element.removeEventListener("error", onError);
      element.removeEventListener("loadeddata", presentFallbackFrame);
      element.removeEventListener("loadedmetadata", playFromEpisodeStart);
      element.removeEventListener("seeked", presentFallbackFrame);
      element.removeEventListener("timeupdate", onTimeUpdate);
      element.style.visibility = "hidden";
      element.pause();
      element.removeAttribute("src");
      element.load();
    };
  }, [endTimeSeconds, sourceUrl, startTimeSeconds]);

  return (
    <video
      aria-hidden
      className={classes.nativeVideo}
      data-testid="lerobot-grid-hover-video"
      muted
      playsInline
      preload="metadata"
      ref={videoRef}
      src={sourceUrl}
    />
  );
}
