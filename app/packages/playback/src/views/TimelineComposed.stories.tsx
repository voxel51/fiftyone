import type { Meta, StoryObj } from "@storybook/react";
import { PlaybackProvider } from "../lib/PlaybackProvider";
import TimelineWithTracks from "./TimelineWithTracks";

const meta: Meta = {
  title: "Playback/TimelineComposed",
};
export default meta;

const TRACKS = [
  { id: "camera", color: "#4a9eff", start: 0, end: 10, events: [1, 3, 7] },
  { id: "lidar", color: "#ff7c4a", start: 2, end: 9, events: [2.5, 5, 8] },
  { id: "pose", color: "#4aff9e", start: 1, end: 8, events: [4, 6] },
];

export const Default: StoryObj = {
  render: () => (
    <PlaybackProvider duration={10} stepInterval={1 / 30}>
      <div style={{ width: 900 }}>
        <TimelineWithTracks tracks={TRACKS} />
      </div>
    </PlaybackProvider>
  ),
};

export const SlowPlayback: StoryObj = {
  render: () => (
    <PlaybackProvider duration={10} stepInterval={1 / 30} defaultSpeed={0.25}>
      <div style={{ width: 900 }}>
        <TimelineWithTracks tracks={TRACKS} />
      </div>
    </PlaybackProvider>
  ),
};

export const WithLoopRegion: StoryObj = {
  render: () => (
    <PlaybackProvider
      duration={10}
      stepInterval={1 / 30}
      defaultLoopStart={2}
      defaultLoopEnd={7}
    >
      <div style={{ width: 900 }}>
        <TimelineWithTracks tracks={TRACKS} />
      </div>
    </PlaybackProvider>
  ),
};
