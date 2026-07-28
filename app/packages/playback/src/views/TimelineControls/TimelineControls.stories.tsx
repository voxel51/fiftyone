import type { Meta, StoryObj } from "@storybook/react";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import TimelineControls from "./TimelineControls";

const meta: Meta<typeof TimelineControls> = {
  title: "Playback/Components/TimelineControls",
  component: TimelineControls,
};
export default meta;

type Story = StoryObj<typeof TimelineControls>;

export const Default: Story = {
  render: () => (
    <PlaybackProvider duration={20} stepInterval={1 / 30}>
      <TimelineControls />
    </PlaybackProvider>
  ),
};

export const WithLoopMoved: Story = {
  render: () => (
    <PlaybackProvider
      duration={20}
      stepInterval={1 / 30}
      defaultLoopStart={4}
      defaultLoopEnd={14}
    >
      <TimelineControls />
    </PlaybackProvider>
  ),
};
