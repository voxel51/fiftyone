import type { Meta, StoryObj } from "@storybook/react";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import LoopBounds from "./LoopBounds";

const meta: Meta<typeof LoopBounds> = {
  title: "Playback/Components/LoopBounds",
  component: LoopBounds,
};
export default meta;

type Story = StoryObj<typeof LoopBounds>;

/** Loop spans the full timeline — readout collapses to nothing. */
export const FullLoop: Story = {
  render: () => (
    <PlaybackProvider duration={10} stepInterval={1 / 30}>
      <LoopBounds />
    </PlaybackProvider>
  ),
};

/** Both bounds moved inward — both readouts are clickable to reset. */
export const InsetBounds: Story = {
  render: () => (
    <PlaybackProvider
      duration={10}
      stepInterval={1 / 30}
      defaultLoopStart={2.5}
      defaultLoopEnd={7.5}
    >
      <LoopBounds />
    </PlaybackProvider>
  ),
};
