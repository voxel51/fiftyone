import type { Meta, StoryObj } from "@storybook/react";
import LidarTile from "./LidarTile";
import { TileStory } from "../../../stories/utils";

const meta: Meta = { title: "Playback/Tiles/LidarTile" };
export default meta;

export const Default: StoryObj = {
  render: () => (
    <TileStory
      title="lidar_top"
      config={{
        type: "lidar",
        id: "lidar_top",
        title: "Lidar top",
        duration: 12,
        hz: 10,
      }}
    >
      <LidarTile streamId="lidar_top" />
    </TileStory>
  ),
};
