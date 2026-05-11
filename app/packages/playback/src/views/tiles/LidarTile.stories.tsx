import type { Meta, StoryObj } from "@storybook/react";
import LidarTile from "./LidarTile";
import Tile from "./Tile";

const meta: Meta = { title: "Playback/Tiles/LidarTile" };
export default meta;

export const Default: StoryObj = {
  render: () => (
    <div style={{ width: 480, height: 270 }}>
      <Tile
        title="lidar_top"
        onClose={() => alert("close")}
        onFullscreen={() => alert("fullscreen")}
      >
        <LidarTile />
      </Tile>
    </div>
  ),
};
