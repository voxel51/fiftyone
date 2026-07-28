import type { Meta, StoryObj } from "@storybook/react";
import { useRef } from "react";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import TimelineRuler from "./TimelineRuler";

const meta: Meta<typeof TimelineRuler> = {
  title: "Playback/Components/TimelineRuler",
  component: TimelineRuler,
};
export default meta;

type Story = StoryObj<typeof TimelineRuler>;

function Wrapper(props: { labelWidth?: number }) {
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
        <TimelineRuler labelWidth={props.labelWidth} zoomRef={containerRef} />
      </div>
    </PlaybackProvider>
  );
}

export const WithLabelColumn: Story = {
  render: () => <Wrapper labelWidth={120} />,
};

export const NoLabelColumn: Story = {
  render: () => <Wrapper labelWidth={0} />,
};
