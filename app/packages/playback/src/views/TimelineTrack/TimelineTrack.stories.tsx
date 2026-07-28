import type { Meta, StoryObj } from "@storybook/react";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import TimelineTrack from "./TimelineTrack";

const meta: Meta<typeof TimelineTrack> = {
  title: "Playback/Components/TimelineTrack",
  component: TimelineTrack,
};
export default meta;

type Story = StoryObj<typeof TimelineTrack>;

const HOST_WIDTH = 800;

function Host({ children }: { children: React.ReactNode }) {
  return (
    <PlaybackProvider duration={20} stepInterval={1 / 30}>
      <div style={{ width: HOST_WIDTH }}>{children}</div>
    </PlaybackProvider>
  );
}

export const PointEvents: Story = {
  render: () => (
    <Host>
      <TimelineTrack
        id="cat"
        label="Cat detected"
        color="#f8a4cc"
        events={[1.2, 3.4, 6.0, 12.5, 17.1]}
        labelWidth={140}
      />
    </Host>
  ),
};

export const IntervalEvents: Story = {
  render: () => (
    <Host>
      <TimelineTrack
        id="collision"
        label="Collision risk"
        color="#ff7c4a"
        events={[
          { startSec: 2, endSec: 4, label: "near miss" },
          { startSec: 9, endSec: 11, label: "stop sign" },
        ]}
        labelWidth={140}
      />
    </Host>
  ),
};

export const Pinned: Story = {
  render: () => (
    <Host>
      <TimelineTrack
        id="pinned"
        label="Pinned"
        color="#4a9eff"
        events={[2, 6, 11]}
        labelWidth={140}
        pinned
        onPinClick={() => {}}
      />
    </Host>
  ),
};

export const NoLabelColumn: Story = {
  render: () => (
    <Host>
      <TimelineTrack
        id="loose"
        color="#a3e7a3"
        events={[2, 6, 11]}
        labelWidth={0}
      />
    </Host>
  ),
};
