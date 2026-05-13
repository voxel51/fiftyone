import type { Meta, StoryObj } from "@storybook/react";
import GraphTile from "./GraphTile";
import { TileStory } from "../../../stories/utils";

const meta: Meta = { title: "Playback/Tiles/GraphTile" };
export default meta;

export const Default: StoryObj = {
  render: () => (
    <TileStory
      title="imu"
      config={{
        type: "graph",
        id: "imu",
        title: "IMU",
        duration: 12,
        hz: 50,
      }}
    >
      <GraphTile />
    </TileStory>
  ),
};
