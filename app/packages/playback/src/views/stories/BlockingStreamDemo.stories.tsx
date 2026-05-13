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
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import {
  MosaicGrid,
  TilingProvider,
  useTiling,
  type TilingTile,
} from "@fiftyone/tiling";
import { TrackProvider } from "../../lib/TrackProvider";
import BlobTile from "../tiles/test_tiles/BlobTile/BlobTile";
import BlockingTile from "../tiles/test_tiles/BlockingTile/BlockingTile";
import TimelineWithTracks from "../TimelineWithTracks/TimelineWithTracks";

const meta: Meta = { title: "Playback/BlockingStreamDemo" };
export default meta;

type TileKind = "blob" | "blocking";

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

function DemoBody() {
  const { layout, tiles, focusedTileId, setLayout, setFocusedTileId, addTile, autoLayout } =
    useTiling();

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

      <TimelineWithTracks />
    </div>
  );
}

export const Default: StoryObj = {
  render: () => (
    <PlaybackProvider stepInterval={1 / 30}>
      <TrackProvider>
        <TilingProvider initialTiles={INITIAL_TILES}>
          <DemoBody />
        </TilingProvider>
      </TrackProvider>
    </PlaybackProvider>
  ),
};
