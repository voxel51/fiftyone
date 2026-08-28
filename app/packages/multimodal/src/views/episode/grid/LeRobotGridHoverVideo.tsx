import { getFetchUrl } from "@fiftyone/utilities";
import { useEffect, useId, useRef, useState } from "react";

import type { EpisodePreviewNativeVideo } from "../../../ir";
import type { BitmapDrawSize } from "../../../visualization/media-2d/BitmapImageView";
import classes from "./GridRenderer.module.css";
import {
  requestGridNativeVideoLease,
  type GridNativeVideoLeaseRequest,
} from "./grid-native-video-lease";

type VideoFrameCallback = (
  now: number,
  metadata: { readonly mediaTime: number },
) => void;

type VideoWithFrameCallbacks = HTMLVideoElement & {
  cancelVideoFrameCallback?: (handle: number) => void;
  requestVideoFrameCallback?: (callback: VideoFrameCallback) => number;
};

// Native media clocks commonly round MP4 timestamps to six decimal places.
// One millisecond accepts that representation loss while remaining far below
// one 15fps DROID frame, so an adjacent episode frame is never admitted.
const START_TIME_EPSILON_SECONDS = 0.001;
const POSTER_RETRY_INTERVAL_MS = 100;
const POSTER_RETRY_LIMIT = 50;

interface LeRobotGridHoverVideoProps {
  readonly active: boolean;
  readonly capturePoster: boolean;
  readonly onCanvasCommitted: (
    canvas: HTMLCanvasElement,
    size: BitmapDrawSize,
  ) => void;
  readonly onError: (error: Error) => void;
  readonly onSurfaceRetainedBytesChange: (bytes: number) => void;
  readonly playing: boolean;
  readonly video: EpisodePreviewNativeVideo;
}

/** Native MP4 grid surface constrained to one LeRobot episode interval. */
export function LeRobotGridHoverVideo({
  active,
  capturePoster,
  onCanvasCommitted,
  onError,
  onSurfaceRetainedBytesChange,
  playing,
  video,
}: LeRobotGridHoverVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const posterRef = useRef<HTMLCanvasElement | null>(null);
  const posterReadyRef = useRef(false);
  const requestRef = useRef<GridNativeVideoLeaseRequest | null>(null);
  const holderId = useId();
  const [posterReady, setPosterReady] = useState(false);
  const { codec, codecString, endTimeSeconds, startTimeSeconds } = video;
  const sourceUrl = getFetchUrl(video.source.url);
  const wantsMedia = active && (playing || (capturePoster && !posterReady));

  // This effect owns one native decoder lease and its complete media-element
  // lifecycle for the selected episode interval.
  useEffect(() => {
    if (!wantsMedia) return undefined;
    const element = videoRef.current as VideoWithFrameCallbacks | null;
    const poster = posterRef.current;
    if (!element || !poster) return undefined;
    if (codec === "av1" && !supportsNativeCodec(element, codecString)) {
      onError(new Error("AV1 video playback is unsupported by this browser"));
      return undefined;
    }

    const requestFrame = element.requestVideoFrameCallback;
    const cancelFrame = element.cancelVideoFrameCallback;
    const supportsFrameCallbacks = typeof requestFrame === "function";
    let disposed = false;
    let failed = false;
    let frameHandle: number | null = null;
    let playGeneration = 0;
    let showingVideo = false;
    let started = false;
    let posterCaptured = posterReadyRef.current;
    let posterRetryCount = 0;
    let posterRetryTimer: ReturnType<typeof setTimeout> | null = null;

    const setShowingVideo = (showing: boolean) => {
      if (showingVideo === showing) return;
      showingVideo = showing;
      element.style.visibility = showing ? "visible" : "hidden";
      poster.style.visibility =
        showing || !posterCaptured ? "hidden" : "visible";
    };
    const inEpisode = (timeSeconds: number) =>
      timeSeconds >= startTimeSeconds - START_TIME_EPSILON_SECONDS &&
      timeSeconds < endTimeSeconds;
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
    const startAtEpisodeStart = () => {
      if (disposed || failed) return;
      setShowingVideo(false);
      cancelPendingFrame();
      element?.pause();
      element.currentTime = startTimeSeconds;
      scheduleFrame();
      if (playing) play();
      else schedulePosterRetry();
    };
    const capturePresentedPoster = () => {
      if (posterCaptured || !capturePoster) return true;
      const width = element.videoWidth;
      const height = element.videoHeight;
      if (width <= 0 || height <= 0 || element.readyState < 2) return false;
      const context = poster.getContext("2d");
      if (!context) throw new Error("Unable to create native video poster");
      poster.width = width;
      poster.height = height;
      context.drawImage(element, 0, 0, width, height);
      posterCaptured = true;
      poster.style.visibility = playing ? "hidden" : "visible";
      onSurfaceRetainedBytesChange(width * height * 4);
      onCanvasCommitted(poster, { height, width });
      posterReadyRef.current = true;
      setPosterReady(true);
      if (!playing) requestRef.current?.release();
      return true;
    };
    const schedulePosterRetry = () => {
      if (disposed || playing || posterCaptured || posterRetryTimer !== null) {
        return;
      }
      if (posterRetryCount >= POSTER_RETRY_LIMIT) {
        fail(new Error("Timed out waiting for a native video poster frame"));
        return;
      }
      posterRetryCount += 1;
      posterRetryTimer = setTimeout(() => {
        posterRetryTimer = null;
        try {
          if (!inEpisode(element.currentTime) || !capturePresentedPoster()) {
            schedulePosterRetry();
          }
        } catch (error) {
          fail(error);
        }
      }, POSTER_RETRY_INTERVAL_MS);
    };
    const presentFallbackFrame = () => {
      if (
        inEpisode(element.currentTime) &&
        (!supportsFrameCallbacks || !playing)
      ) {
        try {
          if (!capturePresentedPoster()) schedulePosterRetry();
          setShowingVideo(playing);
        } catch (error) {
          fail(error);
        }
      }
    };
    const onTimeUpdate = () => {
      if (element.currentTime >= endTimeSeconds) {
        startAtEpisodeStart();
      } else if (element.currentTime < startTimeSeconds) {
        setShowingVideo(false);
      } else {
        presentFallbackFrame();
      }
    };
    const onMediaError = () => {
      fail(new Error(`Unable to play native ${codec.toUpperCase()} video`));
    };

    function fail(error: unknown) {
      if (failed || disposed) return;
      failed = true;
      playGeneration += 1;
      setShowingVideo(false);
      cancelPendingFrame();
      element?.pause();
      requestRef.current?.release();
      onError(error instanceof Error ? error : new Error(String(error)));
    }

    function onPresentedFrame(
      _now: number,
      metadata: { readonly mediaTime: number },
    ) {
      frameHandle = null;
      if (disposed) return;
      if (metadata.mediaTime >= endTimeSeconds) {
        startAtEpisodeStart();
        return;
      }
      if (!inEpisode(metadata.mediaTime)) {
        setShowingVideo(false);
        scheduleFrame();
        return;
      }
      try {
        if (!capturePresentedPoster()) schedulePosterRetry();
        setShowingVideo(playing);
        if (playing) scheduleFrame();
      } catch (error) {
        fail(error);
      }
    }

    const cleanupMedia = () => {
      if (!started) return;
      started = false;
      playGeneration += 1;
      cancelPendingFrame();
      if (posterRetryTimer !== null) {
        clearTimeout(posterRetryTimer);
        posterRetryTimer = null;
      }
      element.removeEventListener("ended", startAtEpisodeStart);
      element.removeEventListener("error", onMediaError);
      element.removeEventListener("loadeddata", presentFallbackFrame);
      element.removeEventListener("loadedmetadata", startAtEpisodeStart);
      element.removeEventListener("seeked", presentFallbackFrame);
      element.removeEventListener("timeupdate", onTimeUpdate);
      element.style.visibility = "hidden";
      poster.style.visibility = posterCaptured ? "visible" : "hidden";
      element.pause();
      element.removeAttribute("src");
      element.load();
    };
    const startMedia = () => {
      if (disposed || started) return;
      started = true;
      element.addEventListener("ended", startAtEpisodeStart);
      element.addEventListener("error", onMediaError);
      element.addEventListener("loadeddata", presentFallbackFrame);
      element.addEventListener("loadedmetadata", startAtEpisodeStart);
      element.addEventListener("seeked", presentFallbackFrame);
      element.addEventListener("timeupdate", onTimeUpdate);
      setShowingVideo(false);
      element.setAttribute("src", sourceUrl);
      element.load();
      if (element.readyState >= 1) startAtEpisodeStart();
    };
    const request = requestGridNativeVideoLease(
      holderId,
      playing ? "playing" : "poster",
      startMedia,
      cleanupMedia,
    );
    requestRef.current = request;

    return () => {
      disposed = true;
      request.release();
      if (requestRef.current === request) requestRef.current = null;
      cleanupMedia();
    };
  }, [
    capturePoster,
    codec,
    codecString,
    endTimeSeconds,
    holderId,
    onCanvasCommitted,
    onError,
    onSurfaceRetainedBytesChange,
    playing,
    sourceUrl,
    startTimeSeconds,
    wantsMedia,
  ]);

  // This effect releases the captured poster surface when the grid cell is no
  // longer visible, even if the component remains mounted by virtualization.
  useEffect(() => {
    if (active) return;
    const poster = posterRef.current;
    if (poster) {
      poster.width = 0;
      poster.height = 0;
      poster.style.visibility = "hidden";
    }
    posterReadyRef.current = false;
    setPosterReady(false);
    onSurfaceRetainedBytesChange(0);
  }, [active, onSurfaceRetainedBytesChange]);

  // This effect clears retained poster memory and accounting on unmount.
  useEffect(
    () => () => {
      const poster = posterRef.current;
      if (poster) {
        poster.width = 0;
        poster.height = 0;
      }
      onSurfaceRetainedBytesChange(0);
    },
    [onSurfaceRetainedBytesChange],
  );

  return (
    <>
      <canvas
        aria-hidden
        className={classes.nativePoster}
        data-testid="lerobot-grid-native-poster"
        ref={posterRef}
      />
      <video
        aria-hidden
        className={classes.nativeVideo}
        data-testid="lerobot-grid-hover-video"
        muted
        playsInline
        preload="metadata"
        ref={videoRef}
      />
    </>
  );
}

function supportsNativeCodec(
  element: HTMLVideoElement,
  codecString: string,
): boolean {
  return element.canPlayType(`video/mp4; codecs="${codecString}"`) !== "";
}
