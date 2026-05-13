import type { Meta, StoryObj } from "@storybook/react";
import JsonDataTile from "./JsonDataTile";
import { Tile } from "@fiftyone/tiling";

const meta: Meta = { title: "Playback/Tiles/JsonDataTile" };
export default meta;

export const Default: StoryObj = {
  render: () => (
    <div style={{ width: 480, height: 270 }}>
      <Tile
        title="gps"
        onClose={() => alert("close")}
        onFullscreen={() => alert("fullscreen")}
      >
        <JsonDataTile
          data={{
            lat: 37.7749,
            lng: -122.4194,
            alt: 12.4,
            accuracy: 3.1,
            fix: "rtk",
            satellites: 14,
          }}
        />
      </Tile>
    </div>
  ),
};
