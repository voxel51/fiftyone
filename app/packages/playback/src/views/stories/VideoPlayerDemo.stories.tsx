import type { Meta, StoryObj } from "@storybook/react";
import { useRef } from "react";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import { useVideoStream } from "../../lib/playback/use-video-stream";
import { useVideoSync } from "../../lib/playback/use-video-sync";
import SimplePlaybackBar from "../SimplePlaybackBar/SimplePlaybackBar";
// Drop a `crowd.mp4` into `src/views/assets/` to run this story locally.
// The whole `assets/` directory is gitignored — videos live there only on
// the dev's machine, never in the repo.
import VIDEO_SRC from "../assets/crowd.mp4";

const meta: Meta = { title: "Playback/VideoPlayerDemo" };
export default meta;

/**
 * The video player surface. Two hooks do the wiring:
 *
 * - `useVideoStream` registers the video as a PlaybackStream so the engine
 *   gets the timeline duration + buffer state from the actual data.
 * - `useVideoSync` bridges the video element to the engine's atoms (play /
 *   pause / scrub / time mirroring).
 *
 * Notably the PlaybackProvider doesn't receive a `duration` prop —
 * `durationAtom` is derived from the registered stream(s).
 */
function VideoSurface({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useVideoStream("video", videoRef);
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

export const Default: StoryObj = {
  render: () => (
    <PlaybackProvider stepInterval={1 / 30}>
      <VideoSurface src={VIDEO_SRC} />
    </PlaybackProvider>
  ),
};
