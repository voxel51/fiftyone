import type { Meta, StoryObj } from "@storybook/react";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import PlayheadLine from "./PlayheadLine";

const meta: Meta<typeof PlayheadLine> = {
  title: "Playback/Components/PlayheadLine",
  component: PlayheadLine,
};
export default meta;

type Story = StoryObj<typeof PlayheadLine>;

/**
 * The playhead line is absolutely positioned, so it needs a sized,
 * relatively-positioned ancestor to show up. The wrapper here mirrors
 * what a timeline ruler/track region would look like.
 */
export const Default: Story = {
  render: () => (
    <PlaybackProvider duration={10} stepInterval={1 / 30}>
      <div
        style={{
          position: "relative",
          width: 600,
          height: 80,
          background: "var(--color-content-bg-card-1)",
          border: "1px solid var(--color-content-border-default)",
        }}
      >
        <PlayheadLine labelWidth={120} />
      </div>
    </PlaybackProvider>
  ),
};
