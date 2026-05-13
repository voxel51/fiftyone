import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import { TrackProvider } from "../../lib/tracks/TrackProvider";
import { DEFAULT_PINNED_TRACK_IDS, DEFAULT_TRACKS } from "../../stories/utils";
import TimelineWithTracks from "./TimelineWithTracks";

const meta: Meta<typeof TimelineWithTracks> = {
  title: "Playback/Components/TimelineWithTracks",
  component: TimelineWithTracks,
};
export default meta;

type Story = StoryObj<typeof TimelineWithTracks>;

function StoryShell({ children }: { children: ReactNode }) {
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
        Main content area
      </div>
      {children}
    </div>
  );
}

export const WithTracks: Story = {
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

export const NoTracks: Story = {
  render: () => (
    <PlaybackProvider duration={12} stepInterval={1 / 30}>
      <TrackProvider>
        <StoryShell>
          <TimelineWithTracks />
        </StoryShell>
      </TrackProvider>
    </PlaybackProvider>
  ),
};
