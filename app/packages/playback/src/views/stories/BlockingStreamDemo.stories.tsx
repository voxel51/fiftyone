import {
  Dropdown,
  DropdownAnchor,
  DropdownTrigger,
  IconName,
  MenuIconTextItem,
  MenuSeparator,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import type { Meta, StoryObj } from "@storybook/react";
import { PlaybackProvider } from "../../lib/PlaybackProvider";
import {
  TilingProvider,
  TilingTile,
  useTiling,
} from "../../lib/TilingProvider";
import BlobTile from "../tiles/test_tiles/BlobTile/BlobTile";
import BlockingTile from "../tiles/test_tiles/BlockingTile/BlockingTile";
import MosaicGrid from "../tiles/MosaicGrid";
import TimelineWithTracks, {
  TimelineTrackConfig,
} from "../TimelineWithTracks/TimelineWithTracks";

const meta: Meta = { title: "Playback/BlockingStreamDemo" };
export default meta;

type TileKind = "blob" | "blocking";

const STREAM_DURATION = 20;

const KIND_LABELS: Record<TileKind, string> = {
  blob: "Blob (non-blocking)",
  blocking: "Random blocking stream",
};

const KIND_ICONS: Record<TileKind, IconName> = {
  blob: IconName.Embeddings,
  blocking: IconName.Logs,
};

const KIND_RENDERERS: Record<TileKind, () => React.ReactNode> = {
  blob: () => <BlobTile />,
  blocking: () => <BlockingTile />,
};

const KIND_TITLES: Record<TileKind, string> = {
  blob: "blob",
  blocking: "blocking",
};

function tile(kind: TileKind, title: string): TilingTile {
  return { title, render: KIND_RENDERERS[kind] };
}

const INITIAL_TILES: Record<string, TilingTile> = {
  "blob-1": tile("blob", "blob_a"),
  "blocking-1": tile("blocking", "blocking_a"),
};

const KIND_TRACK_COLOR: Record<TileKind, string> = {
  blob: "#7c5cff",
  blocking: "#ff7c4a",
};

/** Recover a tile's kind from its generated id (e.g. `blocking-3` → `blocking`). */
function kindFromId(id: string): TileKind | null {
  if (id.startsWith("blob")) return "blob";
  if (id.startsWith("blocking")) return "blocking";
  return null;
}

function tracksFromTiles(
  tiles: Record<string, TilingTile>
): TimelineTrackConfig[] {
  return Object.keys(tiles).map((id) => {
    const kind = kindFromId(id);
    return {
      id,
      color: kind ? KIND_TRACK_COLOR[kind] : "#888",
      start: 0,
      end: STREAM_DURATION,
      // A handful of evenly-spaced "events" so the track has some texture;
      // these don't correspond to any real data, they're just visual.
      events: [2, 5, 8, 12, 16, 19],
    };
  });
}

function DemoBody() {
  const { layout, tiles, focusedTileId, setLayout, setFocusedTileId, addTile, autoLayout } =
    useTiling();

  const tracks = tracksFromTiles(tiles);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 32px)",
        background: "var(--color-content-bg-background)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: 8,
          borderBottom: "1px solid var(--color-content-border-default)",
        }}
      >
        <Dropdown
          anchor={DropdownAnchor.BottomStart}
          trigger={<DropdownTrigger>Add tile</DropdownTrigger>}
        >
          {(Object.keys(KIND_LABELS) as TileKind[]).map((kind) => (
            <MenuIconTextItem
              key={kind}
              icon={KIND_ICONS[kind]}
              text={KIND_LABELS[kind]}
              onClick={() =>
                addTile(tile(kind, `${KIND_TITLES[kind]}_${Date.now() % 1000}`), {
                  idPrefix: kind,
                })
              }
            />
          ))}
          <MenuSeparator />
          <MenuIconTextItem
            icon={IconName.Refresh}
            text="Auto Layout"
            onClick={autoLayout}
          />
        </Dropdown>

        <Text variant={TextVariant.Sm} color={TextColor.Muted}>
          Spawn blob tiles (non-blocking) and blocking tiles (random 3–5s
          stalls). One blocking tile stalls every tile.
        </Text>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <MosaicGrid
            tiles={tiles}
            value={layout}
            onChange={setLayout}
            focusedTileId={focusedTileId}
            onFocusTile={setFocusedTileId}
          />
        </div>
      </div>

      <TimelineWithTracks tracks={tracks} />
    </div>
  );
}

export const Default: StoryObj = {
  render: () => (
    <PlaybackProvider stepInterval={1 / 30}>
      <TilingProvider initialTiles={INITIAL_TILES}>
        <DemoBody />
      </TilingProvider>
    </PlaybackProvider>
  ),
};
