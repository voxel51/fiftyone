import type { Meta, StoryObj } from "@storybook/react";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import PlayheadTime from "./PlayheadTime";

const meta: Meta<typeof PlayheadTime> = {
  title: "Playback/Components/PlayheadTime",
  component: PlayheadTime,
};
export default meta;

type Story = StoryObj<typeof PlayheadTime>;

export const Default: Story = {
  render: () => (
    <PlaybackProvider duration={12.345} stepInterval={1 / 30}>
      <PlayheadTime />
    </PlaybackProvider>
  ),
};
