import type { Meta, StoryObj } from "@storybook/react";
import { PlaybackProvider } from "../../lib/PlaybackProvider";
import TimelineWithTracks from "../TimelineWithTracks/TimelineWithTracks";

const meta: Meta = {
  title: "Playback/TimelineComposed",
};
export default meta;

const TRACKS = [
  { id: "camera_front", color: "#4a9eff", start: 0, end: 10, events: [1, 3, 7] },
  { id: "camera_left", color: "#4a9eff", start: 0, end: 10, events: [1.2, 3.4, 7.1] },
  { id: "camera_right", color: "#4a9eff", start: 0, end: 10, events: [1.1, 3.2, 7.05] },
  { id: "lidar_top", color: "#ff7c4a", start: 2, end: 9, events: [2.5, 5, 8] },
  { id: "lidar_rear", color: "#ff7c4a", start: 2, end: 9, events: [2.6, 5.1, 8.1] },
  { id: "pose", color: "#4aff9e", start: 1, end: 8, events: [4, 6] },
  { id: "imu", color: "#ffd24a", start: 0, end: 10, events: [0.5, 4.5, 9] },
  { id: "gps", color: "#c84aff", start: 0, end: 10, events: [0, 2, 4, 6, 8] },
  { id: "radar", color: "#4affe3", start: 1.5, end: 9.5, events: [3, 5.5, 7.5] },
  { id: "can_bus", color: "#ff4a8e", start: 0, end: 10, events: [1, 5, 9] },
  { id: "annotations", color: "#a0a0a0", start: 0.5, end: 9.5, events: [2, 4, 6, 8] },
  { id: "audio", color: "#ffa64a", start: 0, end: 10, events: [3, 7] },
  { id: "camera_front", color: "#4a9eff", start: 0, end: 10, events: [1, 3, 7] },
  { id: "camera_left", color: "#4a9eff", start: 0, end: 10, events: [1.2, 3.4, 7.1] },
  { id: "camera_right", color: "#4a9eff", start: 0, end: 10, events: [1.1, 3.2, 7.05] },
  { id: "lidar_top", color: "#ff7c4a", start: 2, end: 9, events: [2.5, 5, 8] },
  { id: "lidar_rear", color: "#ff7c4a", start: 2, end: 9, events: [2.6, 5.1, 8.1] },
  { id: "pose", color: "#4aff9e", start: 1, end: 8, events: [4, 6] },
  { id: "imu", color: "#ffd24a", start: 0, end: 10, events: [0.5, 4.5, 9] },
  { id: "gps", color: "#c84aff", start: 0, end: 10, events: [0, 2, 4, 6, 8] },
  { id: "radar", color: "#4affe3", start: 1.5, end: 9.5, events: [3, 5.5, 7.5] },
  { id: "can_bus", color: "#ff4a8e", start: 0, end: 10, events: [1, 5, 9] },
  { id: "annotations", color: "#a0a0a0", start: 0.5, end: 9.5, events: [2, 4, 6, 8] },
  { id: "audio", color: "#ffa64a", start: 0, end: 10, events: [3, 7] },
  { id: "camera_front", color: "#4a9eff", start: 0, end: 10, events: [1, 3, 7] },
  { id: "camera_left", color: "#4a9eff", start: 0, end: 10, events: [1.2, 3.4, 7.1] },
  { id: "camera_right", color: "#4a9eff", start: 0, end: 10, events: [1.1, 3.2, 7.05] },
  { id: "lidar_top", color: "#ff7c4a", start: 2, end: 9, events: [2.5, 5, 8] },
  { id: "lidar_rear", color: "#ff7c4a", start: 2, end: 9, events: [2.6, 5.1, 8.1] },
  { id: "pose", color: "#4aff9e", start: 1, end: 8, events: [4, 6] },
  { id: "imu", color: "#ffd24a", start: 0, end: 10, events: [0.5, 4.5, 9] },
  { id: "gps", color: "#c84aff", start: 0, end: 10, events: [0, 2, 4, 6, 8] },
  { id: "radar", color: "#4affe3", start: 1.5, end: 9.5, events: [3, 5.5, 7.5] },
  { id: "can_bus", color: "#ff4a8e", start: 0, end: 10, events: [1, 5, 9] },
  { id: "annotations", color: "#a0a0a0", start: 0.5, end: 9.5, events: [2, 4, 6, 8] },
  { id: "audio", color: "#ffa64a", start: 0, end: 10, events: [3, 7] },
];

// Page-shell wrapper: a fixed-height flex column with a placeholder
// "main content" area that fills the top, and the timeline drawer
// pinned to the bottom. Mirrors how a real app would host the timeline.
function StoryShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 32px)",
        width: "100%",
        background: "var(--color-content-bg-background)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-content-text-muted)",
          borderBottom: "1px solid var(--color-content-border-subtle)",
        }}
      >
        Main content area (grid / data surfaces would render here)
      </div>
      {children}
    </div>
  );
}

export const Default: StoryObj = {
  render: () => (
    <PlaybackProvider duration={10} stepInterval={1 / 30}>
      <StoryShell>
        <TimelineWithTracks tracks={TRACKS} />
      </StoryShell>
    </PlaybackProvider>
  ),
};
