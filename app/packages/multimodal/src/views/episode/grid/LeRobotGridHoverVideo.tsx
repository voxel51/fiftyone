import { getFetchUrl } from "@fiftyone/utilities";
import { useEffect, useId, useRef, useState } from "react";

import type { EpisodePreviewNativeVideo } from "../../../ir";
import type { BitmapDrawSize } from "../../../visualization/media-2d/BitmapImageView";
import { useLatestRef } from "../../../visualization/media-2d/use-latest-ref";
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
  /**
   * Reports the instant the element is presenting, on its own media clock.
   * Native playback advances the element rather than the grid's read loop, so
   * this is the only thing that can keep the tile's published playhead moving.
   */
  readonly onPresentedTimeSeconds?: (mediaTimeSeconds: number) => void;
  readonly onSurfaceRetainedBytesChange: (bytes: number) => void;
  readonly playing: boolean;
  /**
   * Where to move the element's clock to, in its own media seconds, carrying
   * the id of the request that asked. The element owns its clock, so a seek
   * from outside — a click on the tile's interval lane — can only reach it as
   * a prop; the id is what makes asking twice for the same instant two seeks.
   */
  readonly seek?: {
    readonly requestId: number;
    readonly timeSeconds: number;
  } | null;
  readonly video: EpisodePreviewNativeVideo;
}

/** Native MP4 grid surface constrained to one LeRobot episode interval. */
export function LeRobotGridHoverVideo({
  active,
  capturePoster,
  onCanvasCommitted,
  onError,
  onPresentedTimeSeconds,
  onSurfaceRetainedBytesChange,
  playing,
  seek,
  video,
}: LeRobotGridHoverVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const posterRef = useRef<HTMLCanvasElement | null>(null);
  const posterReadyRef = useRef(false);
  const requestRef = useRef<GridNativeVideoLeaseRequest | null>(null);
  /**
   * A seek that arrived before the element had a source, clamped and ready to
   * apply. The lease can queue behind other tiles, so the request routinely
   * lands while there is no clock to move; without this the element would
   * later start at the episode's beginning and the clicked instant would be
   * lost. Consumed once, by the first start after the source is assigned.
   */
  const pendingSeekRef = useRef<number | null>(null);
  const onCanvasCommittedRef = useLatestRef(onCanvasCommitted);
  const onErrorRef = useLatestRef(onError);
  const onPresentedTimeSecondsRef = useLatestRef(onPresentedTimeSeconds);
  const onSurfaceRetainedBytesChangeRef = useLatestRef(
    onSurfaceRetainedBytesChange,
  );
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
      onErrorRef.current(
        new Error("AV1 video playback is unsupported by this browser"),
      );
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
      // A seek that could not be applied while the lease was queued is spent
      // here, on the first start after the source lands. Taken exactly once,
      // so the `ended` wrap and the past-the-end restart below still go to
      // the episode's beginning as they should.
      const pending = pendingSeekRef.current;
      pendingSeekRef.current = null;
      element.currentTime = pending ?? startTimeSeconds;
      scheduleFrame();
      if (playing) play();
      else schedulePosterRetry();
    };
    const capturePresentedPoster = () => {
      if (posterCaptured || !capturePoster) return true;
      const width = element.videoWidth;
      const height = element.videoHeight;
      // `currentTime` reports the SEEK TARGET the moment it is assigned,
      // while `readyState` can still describe the position being left. An
      // episode opens far into a shared file, so capturing before the seek
      // lands paints a frame that has not been decoded: a black tile.
      if (
        width <= 0 ||
        height <= 0 ||
        element.readyState < 2 ||
        element.seeking
      ) {
        return false;
      }
      const context = poster.getContext("2d");
      if (!context) throw new Error("Unable to create native video poster");
      poster.width = width;
      poster.height = height;
      context.drawImage(element, 0, 0, width, height);
      posterCaptured = true;
      poster.style.visibility = playing ? "hidden" : "visible";
      onSurfaceRetainedBytesChangeRef.current(width * height * 4);
      onCanvasCommittedRef.current(poster, { height, width });
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
          onPresentedTimeSecondsRef.current?.(element.currentTime);
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

    function fail(error: unknown) {
      if (failed || disposed) return;
      failed = true;
      playGeneration += 1;
      setShowingVideo(false);
      cleanupMedia();
      requestRef.current?.release();
      onErrorRef.current(
        error instanceof Error ? error : new Error(String(error)),
      );
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
        onPresentedTimeSecondsRef.current?.(metadata.mediaTime);
        if (playing) scheduleFrame();
      } catch (error) {
        fail(error);
      }
    }

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
    onCanvasCommittedRef,
    onErrorRef,
    onPresentedTimeSecondsRef,
    onSurfaceRetainedBytesChangeRef,
    playing,
    sourceUrl,
    startTimeSeconds,
    wantsMedia,
  ]);

  // This effect moves the element's clock to a requested instant.
  //
  // Separate from the lifecycle effect above so that a seek does not tear the
  // media down and rebuild it. Nothing further is needed to present the
  // result: the `seeked` listener and the frame callback both already run on
  // whatever the element lands on.
  const seekRequestId = seek?.requestId;
  const seekTimeSeconds = seek?.timeSeconds;
  useEffect(() => {
    if (seekRequestId === undefined || seekTimeSeconds === undefined) {
      // The request was withdrawn, or this tile was pointed at another
      // episode. Either way a target held for a queued lease is now a time on
      // media this element is not going to play.
      pendingSeekRef.current = null;
      return;
    }
    const target = Math.min(
      Math.max(seekTimeSeconds, startTimeSeconds),
      // The episode's last instant is not part of it — landing exactly on the
      // end would read as "ran out" and wrap straight back to the start.
      Math.max(endTimeSeconds - START_TIME_EPSILON_SECONDS, startTimeSeconds),
    );
    const element = videoRef.current;
    // No source means no clock to move yet: the lease is still queued behind
    // another tile. Hold the target so the start that follows the grant lands
    // on it instead of the episode's beginning. A source whose metadata has
    // not arrived is the same case: the first start runs off `loadedmetadata`
    // and would write the episode's beginning over anything set before it.
    if (!element?.getAttribute("src") || element.readyState < 1) {
      pendingSeekRef.current = target;
      return;
    }
    pendingSeekRef.current = null;
    element.currentTime = target;
  }, [endTimeSeconds, seekRequestId, seekTimeSeconds, startTimeSeconds]);

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
    onSurfaceRetainedBytesChangeRef.current(0);
  }, [active, onSurfaceRetainedBytesChangeRef]);

  // This effect clears retained poster memory and accounting on unmount.
  useEffect(
    () => () => {
      const poster = posterRef.current;
      if (poster) {
        poster.width = 0;
        poster.height = 0;
      }
      onSurfaceRetainedBytesChangeRef.current(0);
    },
    [onSurfaceRetainedBytesChangeRef],
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
        // Without CORS the frame painted from this element taints the poster
        // canvas and the poster can never be encoded or cached
        crossOrigin="anonymous"
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
