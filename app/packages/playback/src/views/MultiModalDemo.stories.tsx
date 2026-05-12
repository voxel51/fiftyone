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
import { useCallback, useState } from "react";
import { MosaicNode } from "react-mosaic-component";
import { PlaybackProvider } from "../lib/PlaybackProvider";
import {
  TilingProvider,
  useTiling,
} from "../lib/TilingProvider";
import CameraTile from "./tiles/CameraTile";
import GraphTile from "./tiles/GraphTile";
import JsonDataTile from "./tiles/JsonDataTile";
import LidarTile from "./tiles/LidarTile";
import MosaicGrid, {
  addTileToLayout,
  autoLayout,
  collectTileIds,
} from "./tiles/MosaicGrid";
import SceneTile from "./tiles/SceneTile";
import TimelineWithTracks from "./TimelineWithTracks";

const meta: Meta = { title: "Playback/MultiModalDemo" };
export default meta;

type TileKind = "camera" | "lidar" | "scene" | "graph" | "json";

interface TileEntry {
  kind: TileKind;
  title: string;
}

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

const TRACKS = [
  { id: "camera_front", color: "#4a9eff", start: 0, end: 10, events: [1, 3, 7] },
  { id: "camera_left", color: "#4a9eff", start: 0, end: 10, events: [1.2, 3.4, 7.1] },
  { id: "lidar_top", color: "#ff7c4a", start: 2, end: 9, events: [2.5, 5, 8] },
  { id: "pose", color: "#4aff9e", start: 1, end: 8, events: [4, 6] },
  { id: "imu", color: "#ffd24a", start: 0, end: 10, events: [0.5, 4.5, 9] },
  { id: "gps", color: "#c84aff", start: 0, end: 10, events: [0, 2, 4, 6, 8] },
  { id: "camera_front", color: "#4a9eff", start: 0, end: 10, events: [1, 3, 7] },
  { id: "camera_left", color: "#4a9eff", start: 0, end: 10, events: [1.2, 3.4, 7.1] },
  { id: "lidar_top", color: "#ff7c4a", start: 2, end: 9, events: [2.5, 5, 8] },
  { id: "pose", color: "#4aff9e", start: 1, end: 8, events: [4, 6] },
  { id: "imu", color: "#ffd24a", start: 0, end: 10, events: [0.5, 4.5, 9] },
  { id: "gps", color: "#c84aff", start: 0, end: 10, events: [0, 2, 4, 6, 8] },
];

function renderTileBody(kind: TileKind) {
  switch (kind) {
    case "camera":
      return <CameraTile />;
    case "lidar":
      return <LidarTile />;
    case "scene":
      return <SceneTile />;
    case "graph":
      return <GraphTile />;
    case "json":
      return <JsonDataTile />;
  }
}

/**
 * Left sidebar content — renders the focused tile's settings, or an empty
 * state when no tile is focused. Read straight from the TilingProvider.
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

/**
 * Right sidebar content — a placeholder inspector that surfaces the
 * focused tile's id. Real implementation would show selected-object
 * metadata, annotations, etc.
 */
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
  const { focusedTileId, setFocusedTileId } = useTiling();
  const [entries, setEntries] = useState<Record<string, TileEntry>>(() => ({
    "camera-1": { kind: "camera", title: "camera_front" },
    "lidar-1": { kind: "lidar", title: "lidar_top" },
    "scene-1": { kind: "scene", title: "scene_world" },
    "graph-1": { kind: "graph", title: "imu" },
    "json-1": { kind: "json", title: "metadata" },
  }));
  const [layout, setLayout] = useState<MosaicNode<string> | null>(() =>
    autoLayout(["camera-1", "lidar-1", "scene-1", "graph-1", "json-1"])
  );
  const [counter, setCounter] = useState(2);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const handleLayoutChange = useCallback(
    (next: MosaicNode<string> | null) => {
      setLayout(next);
      const presentIds = new Set(collectTileIds(next));
      setEntries((prev) => {
        const filtered: Record<string, TileEntry> = {};
        for (const [id, entry] of Object.entries(prev)) {
          if (presentIds.has(id)) filtered[id] = entry;
        }
        return filtered;
      });
      // Clear focus if the focused tile was removed.
      if (focusedTileId && !presentIds.has(focusedTileId)) {
        setFocusedTileId(null);
      }
    },
    [focusedTileId, setFocusedTileId]
  );

  const spawn = useCallback(
    (kind: TileKind) => {
      const id = `${kind}-${counter}`;
      setCounter((c) => c + 1);
      setEntries((prev) => ({
        ...prev,
        [id]: { kind, title: `${kind}_${counter}` },
      }));
      setLayout((prev) => addTileToLayout(prev, id, focusedTileId));
      setFocusedTileId(id);
    },
    [counter, focusedTileId, setFocusedTileId]
  );

  const doAutoLayout = useCallback(() => {
    setLayout((prev) => autoLayout(collectTileIds(prev)));
  }, []);

  const tiles = Object.fromEntries(
    Object.entries(entries).map(([id, entry]) => [
      id,
      {
        title: entry.title,
        render: () => renderTileBody(entry.kind),
      },
    ])
  );

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
      {/* Top toolbar — spans the full width above sidebars + grid.
          Add-tile dropdown on the left, sidebar toggles on the right. */}
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
              onClick={() => spawn(kind)}
            />
          ))}
          <MenuSeparator />
          <MenuIconTextItem
            icon={IconName.Refresh}
            text="Auto Layout"
            onClick={doAutoLayout}
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
            onChange={handleLayoutChange}
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
      <TilingProvider>
        <DemoBody />
      </TilingProvider>
    </PlaybackProvider>
  ),
};
