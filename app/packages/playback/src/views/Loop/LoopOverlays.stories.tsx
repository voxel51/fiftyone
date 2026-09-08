import type { Meta, StoryObj } from "@storybook/react";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import LoopOverlays from "./LoopOverlays";

const meta: Meta<typeof LoopOverlays> = {
  title: "Playback/Components/LoopOverlays",
  component: LoopOverlays,
};
export default meta;

type Story = StoryObj<typeof LoopOverlays>;

/**
 * Overlays are absolutely positioned masks; they need a sized,
 * positioned ancestor with a visible background to show their effect.
 */
export const InsetLoop: Story = {
  render: () => (
    <PlaybackProvider
      duration={10}
      stepInterval={1 / 30}
      defaultLoopStart={2.5}
      defaultLoopEnd={7.5}
    >
      <div
        style={{
          position: "relative",
          width: 600,
          height: 120,
          background: "var(--color-content-bg-card-1)",
          border: "1px solid var(--color-content-border-default)",
        }}
      >
        <LoopOverlays labelWidth={120} />
      </div>
    </PlaybackProvider>
  ),
};
