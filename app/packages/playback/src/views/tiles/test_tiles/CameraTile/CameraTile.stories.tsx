import type { Meta, StoryObj } from "@storybook/react";
import CameraTile from "./CameraTile";
import Tile from "../../Tile";

const meta: Meta = { title: "Playback/Tiles/CameraTile" };
export default meta;

export const Default: StoryObj = {
  render: () => (
    <div style={{ width: 480, height: 270 }}>
      <Tile
        title="camera_front"
        onClose={() => alert("close")}
        onFullscreen={() => alert("fullscreen")}
      >
        <CameraTile />
      </Tile>
    </div>
  ),
};
