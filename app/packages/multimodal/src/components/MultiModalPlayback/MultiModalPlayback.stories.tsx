import type { Meta, StoryObj } from "@storybook/react";
import type { TilingTile } from "@fiftyone/tiling";
import { useMemo } from "react";
import CameraTile from "../../../../playback/src/views/PlaybackTiles/CameraTile/CameraTile";
import GraphTile from "../../../../playback/src/views/PlaybackTiles/GraphTile/GraphTile";
import JsonDataTile from "../../../../playback/src/views/PlaybackTiles/JsonDataTile/JsonDataTile";
import LidarTile from "../../../../playback/src/views/PlaybackTiles/LidarTile/LidarTile";
import SceneTile from "../../../../playback/src/views/PlaybackTiles/SceneTile/SceneTile";
import {
  DEFAULT_PINNED_TRACK_IDS,
  DEFAULT_STREAM_CONFIGS,
  DEFAULT_TRACKS,
  useMockStreams,
  type MockStreamConfig,
} from "../../../../playback/src/stories/utils";
import MultiModalPlayback from "./MultiModalPlayback";

const meta = {
  title: "Multimodal/Demos/MultiModalPlayback",
  component: MultiModalPlayback,
} satisfies Meta<typeof MultiModalPlayback>;
export default meta;

type Story = StoryObj<typeof MultiModalPlayback>;

const STREAM_CONFIGS: MockStreamConfig[] = DEFAULT_STREAM_CONFIGS;

// One initial tile per stream config; each tile gets its stream id via
// the render closure so the body can read the right data.
const INITIAL_TILES: Record<string, TilingTile> = Object.fromEntries(
  STREAM_CONFIGS.map((config) => {
    const Tile = pickTile(config.type);
    return [
      `${config.id}-1`,
      {
        title: config.title ?? config.id,
        render: () => <Tile streamId={config.id} />,
      },
    ];
  })
);

function pickTile(type: MockStreamConfig["type"]) {
  switch (type) {
    case "camera":
      return CameraTile;
    case "lidar":
      return LidarTile;
    case "scene":
      return SceneTile;
    case "graph":
      return GraphTile;
    case "json":
      return JsonDataTile;
  }
}

/** Registers mock streams once the playback providers are in scope. */
function MockSetup() {
  // Stable config reference so useMockStreams' mount-time-only contract
  // doesn't see a new array on each render.
  const configs = useMemo(() => STREAM_CONFIGS, []);
  useMockStreams(configs);
  return null;
}

export const Default: Story = {
  render: () => (
    <div style={{ height: "calc(100vh - 32px)" }}>
      <MultiModalPlayback
        fileName="multimodal_demo.fo"
        tracks={DEFAULT_TRACKS}
        defaultPinnedTrackIds={DEFAULT_PINNED_TRACK_IDS}
        initialTiles={INITIAL_TILES}
      >
        <MockSetup />
      </MultiModalPlayback>
    </div>
  ),
};
