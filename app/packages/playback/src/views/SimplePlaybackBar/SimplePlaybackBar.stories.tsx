import type { Meta, StoryObj } from "@storybook/react";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import SimplePlaybackBar from "./SimplePlaybackBar";

const meta: Meta<typeof SimplePlaybackBar> = {
  title: "Playback/Components/SimplePlaybackBar",
  component: SimplePlaybackBar,
};
export default meta;

type Story = StoryObj<typeof SimplePlaybackBar>;

export const Default: Story = {
  render: () => (
    <PlaybackProvider duration={20} stepInterval={1 / 30}>
      <div style={{ width: 720 }}>
        <SimplePlaybackBar />
      </div>
    </PlaybackProvider>
  ),
};
