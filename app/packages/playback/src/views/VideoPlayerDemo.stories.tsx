import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useRef, useState } from "react";
import { PlaybackProvider } from "../lib/PlaybackProvider";
import { useVideoSync } from "../lib/use-video-sync";
import SimplePlaybackBar from "./SimplePlaybackBar";
// Drop a `crowd.mp4` into `src/views/assets/` to run this story locally.
// The whole `assets/` directory is gitignored — videos live there only on
// the dev's machine, never in the repo.
import VIDEO_SRC from "./assets/crowd.mp4";

const meta: Meta = { title: "Playback/VideoPlayerDemo" };
export default meta;

/**
 * The actual player surface: a `<video>` element with the SimplePlaybackBar
 * underneath. `useVideoSync` keeps the video and the playback engine's
 * atoms in lockstep so the bar's play/pause/scrub all drive the video,
 * and the video's own playback updates the bar.
 */
function VideoSurface({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useVideoSync(videoRef);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "min(960px, 100%)",
        margin: "0 auto",
        background: "#000",
        border: "1px solid var(--color-content-border-default)",
      }}
    >
      <video
        ref={videoRef}
        src={src}
        preload="auto"
        playsInline
        style={{ width: "100%", maxHeight: "70vh", display: "block" }}
      />
      <SimplePlaybackBar />
    </div>
  );
}

/**
 * Wrapper that probes the video for its duration first, then mounts the
 * PlaybackProvider with the correct value. PlaybackProvider's duration is
 * captured at mount, so we can't mount it before we know how long the
 * video is.
 */
function VideoPlayerDemo() {
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.src = VIDEO_SRC;
    const onLoaded = () => {
      if (isFinite(probe.duration) && probe.duration > 0) {
        setDuration(probe.duration);
      } else {
        setError("Video reported no duration.");
      }
    };
    const onError = () =>
      setError(
        `Couldn't load ${VIDEO_SRC}. Make sure crowd.mp4 exists at packages/playback/src/views/assets/crowd.mp4 — that directory is gitignored, so each dev drops their own copy in.`
      );
    probe.addEventListener("loadedmetadata", onLoaded, { once: true });
    probe.addEventListener("error", onError, { once: true });
    return () => {
      probe.removeEventListener("loadedmetadata", onLoaded);
      probe.removeEventListener("error", onError);
    };
  }, []);

  if (error) {
    return (
      <div style={{ padding: 24, color: "var(--color-content-text-destructive)" }}>
        {error}
      </div>
    );
  }

  if (duration === null) {
    return (
      <div style={{ padding: 24, color: "var(--color-content-text-muted)" }}>
        Loading video metadata…
      </div>
    );
  }

  return (
    <PlaybackProvider duration={duration} stepInterval={1 / 30}>
      <VideoSurface src={VIDEO_SRC} />
    </PlaybackProvider>
  );
}

export const Default: StoryObj = {
  render: () => <VideoPlayerDemo />,
};
