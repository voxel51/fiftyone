/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { getFrameNumber, getTime, type VideoLooker } from "@fiftyone/looker";
import {
  bumpStreamRangesVersion,
  useIsPlaying,
  usePlayback,
  usePlaybackStore,
  useSeekEvent,
  useSpeed,
} from "@fiftyone/playback";
import * as fos from "@fiftyone/state";
import { useEffect, useRef, useState } from "react";

const STREAM_ID = "modal-video-looker";

/**
 * Binds a `VideoLooker` to the surrounding `PlaybackProvider` so the shared
 * timeline is the looker's transport.
 *
 * The looker keeps everything it already owns: the `<video>`, frame
 * streaming and worker painting, overlays, zoom, pan, tooltips and its
 * keyboard shortcuts. This hook only carries state across the seam, in both
 * directions:
 *
 * - The looker's frame is the engine's clock. `setClockSource` reads the frame
 *   the looker is painting, so the playhead lands exactly where the overlays
 *   are rather than where a wallclock estimate says the video should be.
 * - The looker's `<video>` registers as a non-blocking stream for its
 *   duration and buffered ranges, which is what sizes the ruler.
 * - Timeline play/pause, seeks (scrubs, steps, loop wraps) and speed drive
 *   the looker. The looker's own `play`/`pause` events (its shortcuts, or
 *   reaching the end) drive the timeline back.
 */
export function useLookerPlaybackBridge(
  looker: VideoLooker,
  frameRate: number | undefined,
): void {
  const { registerStream, subscribeStream, setClockSource, play, pause } =
    usePlayback();
  const store = usePlaybackStore();
  const isPlaying = useIsPlaying();
  const speed = useSpeed();
  const seekEvent = useSeekEvent();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [duration, setDuration] = useState(0);
  // Tracked from the looker's "buffering" events rather than read off
  // `looker.state`: the looker fires the event from inside its state update,
  // before the flag is written, so a barrier re-check triggered by the event
  // would read the old value and hold forever.
  const bufferingRef = useRef(looker.state.buffering);

  // Space and , / . belong to the timeline's own bindings on this surface.
  // Left in the looker too, one press would toggle the engine twice.
  useEffect(() => {
    looker.useExternalTransport();
  }, [looker]);

  // The element exists once the looker has attached, and its duration once
  // metadata has loaded; the looker's `load` covers both.
  useEffect(() => {
    const capture = () => {
      let video: HTMLVideoElement | undefined;
      try {
        video = looker.getVideo();
      } catch {
        return;
      }
      videoRef.current = video;
      if (Number.isFinite(video.duration) && video.duration > 0) {
        setDuration(video.duration);
      }
    };

    capture();
    looker.addEventListener("load", capture);

    return () => {
      looker.removeEventListener("load", capture);
      videoRef.current = null;
    };
  }, [looker]);

  useEffect(() => {
    if (!duration) {
      return undefined;
    }

    const unregister = registerStream({
      id: STREAM_ID,
      // Blocking so the looker's buffering is the engine's buffering: the
      // timeline shows its indicator, and a pending play waits for the
      // looker to be ready. The barrier costs nothing here, since the clock
      // source already freezes on the looker's frame while it buffers.
      blocking: true,
      duration,
      nativeStepSeconds: frameRate ? 1 / frameRate : undefined,
      bufferState: () => (bufferingRef.current ? "loading" : "ready"),
      bufferedRanges: () => {
        const video = videoRef.current;
        if (!video) {
          return [];
        }
        const ranges: Array<[number, number]> = [];
        for (let i = 0; i < video.buffered.length; i++) {
          ranges.push([video.buffered.start(i), video.buffered.end(i)]);
        }
        return ranges;
      },
    });

    // The engine skips a stream nobody consumes. The looker is its own
    // consumer, so subscribe here or the barrier never asks it.
    const unsubscribe = subscribeStream(STREAM_ID);

    return () => {
      unsubscribe();
      unregister();
    };
  }, [duration, frameRate, registerStream, subscribeStream]);

  // The frame the looker is painting is the time the engine should report.
  // `null` before the looker has loaded, for which the engine falls back to
  // its own advance.
  useEffect(() => {
    if (!frameRate) {
      return undefined;
    }

    return setClockSource({
      read: () =>
        looker.state.loaded ? getTime(looker.frameNumber, frameRate) : null,
    });
  }, [looker, frameRate, setClockSource]);

  // Timeline -> looker. Both calls are no-ops when the looker already agrees,
  // so the echo back through the looker's events below settles immediately.
  useEffect(() => {
    if (isPlaying) {
      looker.play();
    } else {
      looker.pause();
    }
  }, [isPlaying, looker]);

  useEffect(() => {
    if (!seekEvent || !frameRate || !duration) {
      return;
    }

    looker.seekToFrame(getFrameNumber(seekEvent.time, duration, frameRate));
    // `seq` changes on every event, including a repeat of the same time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekEvent?.seq]);

  useEffect(() => {
    looker.updateOptions({ playbackRate: speed });
  }, [looker, speed]);

  // Looker -> timeline: reaching the end of the clip, and any play/pause the
  // looker still initiates itself.
  //
  // The looker also reports a "pause" every time it stops to buffer frames,
  // flagged in the detail, and a "play" when it resumes. That one is not a
  // transport change: forwarding it would pause the engine, whose pause
  // comes straight back through the effect above and stops the looker for
  // real, and nothing restarts it once the frames arrive. The clock source
  // already holds the playhead on the looker's frame while it buffers.
  fos.useEventHandler(looker, "play", play);

  // A play pressed while the looker is still buffering is held by the engine
  // as pending, and the engine only re-evaluates a pending play when a stream
  // signals a change in what it has buffered. The looker signals nothing on
  // its own, so without the wake-up a play pressed during the initial buffer
  // never starts. Same wake-up the audio stream uses.
  fos.useEventHandler(looker, "buffering", (event: CustomEvent<boolean>) => {
    bufferingRef.current = Boolean(event.detail);

    if (!event.detail) {
      bumpStreamRangesVersion(store);
    }
  });

  fos.useEventHandler(
    looker,
    "pause",
    (event: CustomEvent<{ buffering?: boolean } | null>) => {
      if (event.detail?.buffering) {
        return;
      }

      pause();
    },
  );
}
