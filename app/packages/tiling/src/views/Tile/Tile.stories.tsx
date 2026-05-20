import type { Meta, StoryObj } from "@storybook/react";
import Tile, { TileHeader } from "./Tile";

const meta: Meta = { title: "Tiling/Components/Tile" };
export default meta;

export const Default: StoryObj = {
  render: () => (
    <div style={{ width: 480, height: 270 }}>
      <Tile
        title="camera_front"
        onClose={() => alert("close")}
        onFullscreen={() => alert("fullscreen")}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "var(--color-content-text-muted)",
          }}
        >
          Tile body content
        </div>
      </Tile>
    </div>
  ),
};

export const HeaderOnly: StoryObj = {
  name: "TileHeader",
  render: () => (
    <div
      style={{
        width: 480,
        background: "var(--color-content-bg-card-1)",
        border: "1px solid var(--color-content-border-default)",
      }}
    >
      <TileHeader
        title="lidar_top"
        onClose={() => alert("close")}
        onFullscreen={() => alert("fullscreen")}
      />
    </div>
  ),
};
