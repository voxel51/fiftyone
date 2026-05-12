import type { Meta, StoryObj } from "@storybook/react";
import SceneTile from "./SceneTile";
import Tile from "../../Tile";

const meta: Meta = { title: "Playback/Tiles/SceneTile" };
export default meta;

export const Default: StoryObj = {
  render: () => (
    <div style={{ width: 480, height: 270 }}>
      <Tile
        title="scene_world"
        onClose={() => alert("close")}
        onFullscreen={() => alert("fullscreen")}
      >
        <SceneTile />
      </Tile>
    </div>
  ),
};
