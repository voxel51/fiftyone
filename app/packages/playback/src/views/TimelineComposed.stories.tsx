import { PlaybackProvider } from "../lib/PlaybackProvider";
import type { Meta, StoryObj } from "@storybook/react";
import React, { useRef } from "react";
import TimelineControls from "./TimelineControls";
import TimelineRuler from "./TimelineRuler";
import TimelineTrack from "./TimelineTrack";

const meta: Meta = {
  title: "Playback/TimelineComposed",
};
export default meta;

const TRACKS = [
  { id: "camera", color: "#4a9eff", start: 0, end: 10, events: [1, 3, 7] },
  { id: "lidar", color: "#ff7c4a", start: 2, end: 9, events: [2.5, 5, 8] },
  { id: "pose", color: "#4aff9e", start: 1, end: 8, events: [4, 6] },
];

const LABEL_WIDTH = 120;

function ComposedTimeline() {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        flexDirection: "column",
        width: 900,
        border: "1px solid var(--color-content-border-default)",
        borderRadius: 6,
        overflow: "hidden",
        background: "var(--color-bg-surface)",
      }}
    >
      <TimelineRuler
        labelWidth={LABEL_WIDTH}
        zoomRef={containerRef}
      />
      {TRACKS.map((track) => (
        <TimelineTrack
          key={track.id}
          {...track}
          labelWidth={LABEL_WIDTH}
        />
      ))}
      <div
        style={{
          padding: "6px 10px",
          borderTop: "1px solid var(--color-content-border-default)",
        }}
      >
        <TimelineControls />
      </div>
    </div>
  );
}

export const Default: StoryObj = {
  render: () => (
    <PlaybackProvider duration={10} stepInterval={1 / 30}>
      <ComposedTimeline />
    </PlaybackProvider>
  ),
};

export const SlowPlayback: StoryObj = {
  render: () => (
    <PlaybackProvider duration={10} stepInterval={1 / 30} defaultSpeed={0.25}>
      <ComposedTimeline />
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
      <ComposedTimeline />
    </PlaybackProvider>
  ),
};
