import type { Meta, StoryObj } from "@storybook/react";
import GraphTile from "./GraphTile";
import { Tile } from "@fiftyone/tiling";

const meta: Meta = { title: "Playback/Tiles/GraphTile" };
export default meta;

export const Default: StoryObj = {
  render: () => (
    <div style={{ width: 480, height: 270 }}>
      <Tile
        title="imu"
        onClose={() => alert("close")}
        onFullscreen={() => alert("fullscreen")}
      >
        <GraphTile />
      </Tile>
    </div>
  ),
};
