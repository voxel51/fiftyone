import type { Meta, StoryObj } from "@storybook/react";
import CameraTile from "./CameraTile";
import { TileStory } from "../../../stories/utils";

const meta: Meta = { title: "Playback/Tiles/CameraTile" };
export default meta;

export const Default: StoryObj = {
  render: () => (
    <TileStory
      title="camera_front"
      config={{
        type: "camera",
        id: "camera_front",
        title: "Camera front",
        duration: 12,
        fps: 30,
      }}
    >
      <CameraTile streamId="camera_front" />
    </TileStory>
  ),
};
