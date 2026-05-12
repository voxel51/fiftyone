import {
  Button,
  Drawer,
  Dropdown,
  DropdownAnchor,
  DropdownTrigger,
  Heading,
  IconName,
  MenuIconTextItem,
  MenuSeparator,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { PlaybackProvider } from "../../lib/PlaybackProvider";
import {
  TilingProvider,
  TilingTile,
  useTiling,
} from "../../lib/TilingProvider";
import CameraTile from "../tiles/test_tiles/CameraTile/CameraTile";
import GraphTile from "../tiles/test_tiles/GraphTile/GraphTile";
import JsonDataTile from "../tiles/test_tiles/JsonDataTile/JsonDataTile";
import LidarTile from "../tiles/test_tiles/LidarTile/LidarTile";
import MosaicGrid from "../tiles/MosaicGrid";
import SceneTile from "../tiles/test_tiles/SceneTile/SceneTile";
import TimelineWithTracks from "../TimelineWithTracks/TimelineWithTracks";

const meta: Meta = { title: "Playback/MultiModalDemo" };
export default meta;

type TileKind = "camera" | "lidar" | "scene" | "graph" | "json";

const KIND_LABELS: Record<TileKind, string> = {
  camera: "Camera",
  lidar: "Lidar",
  scene: "3D Scene",
  graph: "Graph",
  json: "JSON Data",
};

const KIND_ICONS: Record<TileKind, IconName> = {
  camera: IconName.GridView,
  lidar: IconName.Embeddings,
  scene: IconName.GridView,
  graph: IconName.Logs,
  json: IconName.JSON,
};

const KIND_RENDERERS: Record<TileKind, () => React.ReactNode> = {
  camera: () => <CameraTile />,
  lidar: () => <LidarTile />,
  scene: () => <SceneTile />,
  graph: () => <GraphTile />,
  json: () => <JsonDataTile />,
};

function tile(kind: TileKind, title: string): TilingTile {
  return { title, render: KIND_RENDERERS[kind] };
}

const INITIAL_TILES: Record<string, TilingTile> = {
  "camera-1": tile("camera", "camera_front"),
  "lidar-1": tile("lidar", "lidar_top"),
  "scene-1": tile("scene", "scene_world"),
  "graph-1": tile("graph", "imu"),
  "json-1": tile("json", "metadata"),
};

const TRACKS = [
  { id: "camera_front", color: "#4a9eff", start: 0, end: 10, events: [1, 3, 7] },
  { id: "camera_left", color: "#4a9eff", start: 0, end: 10, events: [1.2, 3.4, 7.1] },
  { id: "lidar_top", color: "#ff7c4a", start: 2, end: 9, events: [2.5, 5, 8] },
  { id: "pose", color: "#4aff9e", start: 1, end: 8, events: [4, 6] },
  { id: "imu", color: "#ffd24a", start: 0, end: 10, events: [0.5, 4.5, 9] },
  { id: "gps", color: "#c84aff", start: 0, end: 10, events: [0, 2, 4, 6, 8] },
];

/**
 * Left sidebar — renders the focused tile's settings, or an empty state.
 * Reads directly from the TilingProvider.
 */
function SettingsSidebar() {
  const { focusedTileId, FocusedTileSettings } = useTiling();
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      {focusedTileId && FocusedTileSettings ? (
        <FocusedTileSettings />
      ) : (
        <>
          <Heading>Settings</Heading>
          <Text variant={TextVariant.Sm} color={TextColor.Muted}>
            Focus a tile to edit its settings.
          </Text>
        </>
      )}
    </div>
  );
}

/** Right sidebar — placeholder inspector showing the focused tile id. */
function InspectorSidebar() {
  const { focusedTileId } = useTiling();
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <Heading>Inspector</Heading>
      {focusedTileId ? (
        <>
          <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
            Focused tile
          </Text>
          <Text variant={TextVariant.Sm} color={TextColor.Primary}>
            {focusedTileId}
          </Text>
        </>
      ) : (
        <Text variant={TextVariant.Sm} color={TextColor.Muted}>
          Select a tile to inspect.
        </Text>
      )}
    </div>
  );
}

function DemoBody() {
  const {
    layout,
    tiles,
    focusedTileId,
    setLayout,
    setFocusedTileId,
    addTile,
    autoLayout,
  } = useTiling();
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);


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
          gap: 8,
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
              onClick={() => addTile(tile(kind, `${kind}_${Date.now() % 1000}`), { idPrefix: kind })}
            />
          ))}
          <MenuSeparator />
          <MenuIconTextItem
            icon={IconName.Refresh}
            text="Auto Layout"
            onClick={autoLayout}
          />
        </Dropdown>

        <div style={{ flex: 1 }} />

        <Button
          variant={Variant.Borderless}
          size={Size.Xs}
          leadingIcon={IconName.Menu}
          aria-label={leftOpen ? "Hide settings" : "Show settings"}
          title={leftOpen ? "Hide settings" : "Show settings"}
          onClick={() => setLeftOpen((v) => !v)}
        />
        <Button
          variant={Variant.Borderless}
          size={Size.Xs}
          leadingIcon={IconName.Inspect}
          aria-label={rightOpen ? "Hide inspector" : "Show inspector"}
          title={rightOpen ? "Hide inspector" : "Show inspector"}
          onClick={() => setRightOpen((v) => !v)}
        />
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Drawer
          side="left"
          mode="push"
          defaultSize={280}
          minSize={200}
          maxSize={500}
          open={leftOpen}
          onOpenChange={setLeftOpen}
        >
          <SettingsSidebar />
        </Drawer>

        <div style={{ flex: 1, minWidth: 0 }}>
          <MosaicGrid
            tiles={tiles}
            value={layout}
            onChange={setLayout}
            focusedTileId={focusedTileId}
            onFocusTile={setFocusedTileId}
          />
        </div>

        <Drawer
          side="right"
          mode="push"
          defaultSize={280}
          minSize={200}
          maxSize={500}
          open={rightOpen}
          onOpenChange={setRightOpen}
        >
          <InspectorSidebar />
        </Drawer>
      </div>

      <TimelineWithTracks tracks={TRACKS} />
    </div>
  );
}

export const Default: StoryObj = {
  render: () => (
    <PlaybackProvider duration={10} stepInterval={1 / 30}>
      <TilingProvider initialTiles={INITIAL_TILES}>
        <DemoBody />
      </TilingProvider>
    </PlaybackProvider>
  ),
};
