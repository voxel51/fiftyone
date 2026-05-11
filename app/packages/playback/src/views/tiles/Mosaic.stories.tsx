import {
  Dropdown,
  DropdownAnchor,
  DropdownTrigger,
  IconName,
  MenuIconTextItem,
  MenuSeparator,
} from "@voxel51/voodo";
import type { Meta, StoryObj } from "@storybook/react";
import { useCallback, useState } from "react";
import { MosaicNode } from "react-mosaic-component";
import CameraTile from "./CameraTile";
import GraphTile from "./GraphTile";
import JsonDataTile from "./JsonDataTile";
import LidarTile from "./LidarTile";
import MosaicGrid, {
  addTileToLayout,
  autoLayout,
  collectTileIds,
} from "./MosaicGrid";
import SceneTile from "./SceneTile";

const meta: Meta = { title: "Playback/Tiles/Mosaic" };
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

function MosaicDemo() {
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
  const [focused, setFocused] = useState<string | null>(null);
  const [counter, setCounter] = useState(2);

  // Sync entries with layout after a window is closed via the tile's X.
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
      setFocused((current) => (current && presentIds.has(current) ? current : null));
    },
    []
  );

  const spawn = useCallback(
    (kind: TileKind) => {
      const id = `${kind}-${counter}`;
      setCounter((c) => c + 1);
      setEntries((prev) => ({
        ...prev,
        [id]: { kind, title: `${kind}_${counter}` },
      }));
      // If a tile is focused, split it; otherwise fall back to the largest.
      setLayout((prev) => addTileToLayout(prev, id, focused));
      // Focus the new tile so subsequent spawns split it again.
      setFocused(id);
    },
    [counter, focused]
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
        gap: 8,
        width: "100%",
        height: "calc(100vh - 32px)",
        background: "var(--color-content-bg-background)",
      }}
    >
      <div
        style={{
          display: "flex",
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
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <MosaicGrid
          tiles={tiles}
          value={layout}
          onChange={handleLayoutChange}
          focusedTileId={focused}
          onFocusTile={setFocused}
        />
      </div>
    </div>
  );
}

export const Default: StoryObj = {
  render: () => <MosaicDemo />,
};
