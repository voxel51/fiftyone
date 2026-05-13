import type { Meta, StoryObj } from "@storybook/react";
import { useEffect } from "react";
import { useSetTileSourceFor, type TilingTile } from "@fiftyone/tiling";
import {
  buildBundle,
  DEFAULT_PINNED_TRACK_IDS,
  DEFAULT_STREAM_CONFIGS,
  DEFAULT_TRACKS,
  useMockStreams,
  type MockStreamConfig,
} from "../../../../playback/src/stories/utils";
import MultiModalPlayback from "./MultiModalPlayback";

const meta: Meta = { title: "Multimodal/Demos/MultiModalPlayback" };
export default meta;

const STREAM_CONFIGS: MockStreamConfig[] = DEFAULT_STREAM_CONFIGS;

/**
 * Initial tile entries derived from the stream configs at module level
 * (the bundle factories are pure functions of their config). One tile
 * per stream, id `<streamId>-1` so subsequent TilingProvider adds get
 * `-2`, `-3`, …
 */
const INITIAL_TILES: Record<string, TilingTile> = Object.fromEntries(
  STREAM_CONFIGS.map((config) => {
    const bundle = buildBundle(config);
    const TileComponent = bundle.Tile;
    return [
      `${bundle.id}-1`,
      { title: bundle.title, render: () => <TileComponent /> },
    ];
  })
);

/**
 * Mounts inside MultiModalPlayback's providers. Registers the mock
 * streams with the playback engine, then binds each pre-seeded initial
 * tile (`<streamId>-1`) to its matching stream id so its body resolves
 * the right data out of the gate.
 */
function MockSetup() {
  const bundles = useMockStreams(STREAM_CONFIGS);
  const setTileSource = useSetTileSourceFor();
  useEffect(() => {
    for (const b of bundles) {
      setTileSource(`${b.id}-1`, b.id);
    }
  }, [bundles, setTileSource]);
  return null;
}

export const Default: StoryObj = {
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
