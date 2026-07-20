import type { Meta, StoryObj } from "@storybook/react";
import React, { useRef } from "react";
import { PlaybackProvider } from "./PlaybackProvider";
import { useAudioStream } from "./use-audio-stream";
import { useIsBuffering } from "./use-playback-state";
import { useStream } from "./use-stream";
import { useVideoStream } from "./use-video-stream";
import { useVideoSync } from "./use-video-sync";
import TimelineControls from "../../views/TimelineControls/TimelineControls";

/**
 * Dev harness for the audio pipeline: a muted `<video>` provides the
 * picture (registered as its own blocking stream, exactly like the
 * timeline's real frame streams gate the barrier) while `useAudioStream`
 * supplies the sound from the same URL. Exercises the full contract —
 * barrier gating, drift-chase, seek/step/loop resync, speed, volume UI
 * (the stream publishes availability, so `TimelineControls` shows the
 * real volume group), mute-to-dormant — without the app.
 */

const MEDIA_URL =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

const StatusLine: React.FC<{ hasAudio: boolean | null }> = ({ hasAudio }) => {
  const isBuffering = useIsBuffering();
  return (
    <span style={{ opacity: 0.7 }}>
      hasAudio: {String(hasAudio)} · {isBuffering ? "buffering…" : "ready"}
      {hasAudio === false
        ? " — no audio track, volume group hidden per product decision"
        : null}
    </span>
  );
};

const Player: React.FC<{ src: string }> = ({ src }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useVideoStream("picture", videoRef);
  useVideoSync(videoRef);
  // The picture stream must be active for its blocking gate to matter.
  useStream("picture");

  const { hasAudio } = useAudioStream("audio", src);

  return (
    <div style={{ width: 720, display: "grid", gap: 12 }}>
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        style={{ width: "100%", background: "#000" }}
      />
      <TimelineControls />
      <StatusLine hasAudio={hasAudio} />
    </div>
  );
};

const meta: Meta<typeof Player> = {
  title: "Playback/AudioStream",
  component: Player,
};
export default meta;

type Story = StoryObj<typeof Player>;

export const VideoWithAudio: Story = {
  render: () => (
    <PlaybackProvider stepInterval={1 / 30}>
      <Player src={MEDIA_URL} />
    </PlaybackProvider>
  ),
};
