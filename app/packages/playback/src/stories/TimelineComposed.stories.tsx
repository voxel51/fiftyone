import type { Meta, StoryObj } from "@storybook/react";
import { PlaybackProvider } from "../lib/playback/PlaybackProvider";
import { TrackProvider } from "../lib/TrackProvider";
import TimelineWithTracks from "../views/TimelineWithTracks/TimelineWithTracks";
import { DEFAULT_PINNED_TRACK_IDS, DEFAULT_TRACKS } from "./utils";

const meta: Meta = {
  title: "Playback/TimelineComposed",
};
export default meta;

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
    <PlaybackProvider duration={12} stepInterval={1 / 30}>
      <TrackProvider
        initialTracks={DEFAULT_TRACKS}
        initialPinnedIds={DEFAULT_PINNED_TRACK_IDS}
      >
        <StoryShell>
          <TimelineWithTracks />
        </StoryShell>
      </TrackProvider>
    </PlaybackProvider>
  ),
};
