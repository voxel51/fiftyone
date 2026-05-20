import type { Meta, StoryObj } from "@storybook/react";
import JsonDataTile from "./JsonDataTile";
import { TileStory } from "../../../stories/utils";

const meta: Meta = { title: "Playback/Tiles/JsonDataTile" };
export default meta;

export const Default: StoryObj = {
  render: () => (
    <TileStory
      title="metadata"
      config={{
        type: "json",
        id: "metadata",
        title: "Metadata",
        duration: 12,
        hz: 10,
      }}
    >
      <JsonDataTile />
    </TileStory>
  ),
};
