import type { Meta, StoryObj } from "@storybook/react";
import { useRef } from "react";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import TimelineHeader from "./TimelineHeader";

const meta: Meta<typeof TimelineHeader> = {
  title: "Playback/Components/TimelineHeader",
  component: TimelineHeader,
};
export default meta;

type Story = StoryObj<typeof TimelineHeader>;

function Wrapper() {
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <PlaybackProvider duration={20} stepInterval={1 / 30}>
      <div
        ref={containerRef}
        style={{
          width: 800,
          background: "var(--color-content-bg-card-1)",
        }}
      >
        <TimelineHeader labelWidth={120} zoomRef={containerRef} />
      </div>
    </PlaybackProvider>
  );
}

export const Default: Story = { render: () => <Wrapper /> };
