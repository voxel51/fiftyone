import type { Meta, StoryObj } from "@storybook/react";
import SceneTile from "./SceneTile";
import { TileStory } from "../../../stories/utils";

const meta: Meta = { title: "Playback/Tiles/SceneTile" };
export default meta;

export const Default: StoryObj = {
  render: () => (
    <TileStory
      title="scene_world"
      config={{
        type: "scene",
        id: "scene_world",
        title: "Scene",
        duration: 12,
      }}
    >
      <SceneTile />
    </TileStory>
  ),
};
