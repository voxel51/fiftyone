import type { Meta, StoryObj } from "@storybook/react";
import { useRef } from "react";
import { PlaybackProvider } from "../lib/playback/PlaybackProvider";
import { useVideoStream } from "../lib/playback/use-video-stream";
import { useVideoSync } from "../lib/playback/use-video-sync";
import SimplePlaybackBar from "../views/SimplePlaybackBar/SimplePlaybackBar";

// Public sample so the story renders for anyone — no local asset needed.
const VIDEO_SRC =
  "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

const meta: Meta = { title: "Playback/Demos/VideoPlayer" };
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
