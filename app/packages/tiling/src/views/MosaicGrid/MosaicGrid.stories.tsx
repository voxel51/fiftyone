import type { Meta, StoryObj } from "@storybook/react";
import { useCallback, useState } from "react";
import type { MosaicNode } from "react-mosaic-component";
import { TilingProvider, type TilingTile } from "../../lib/TilingProvider";
import MosaicGrid, {
  addTileToLayout,
  autoLayout,
  collectTileIds,
} from "./MosaicGrid";

const meta: Meta<typeof MosaicGrid> = {
  title: "Tiling/Components/MosaicGrid",
  component: MosaicGrid,
};
export default meta;

type Story = StoryObj<typeof MosaicGrid>;

const palette: Record<string, string> = {
  a: "#4a9eff",
  b: "#ff7c4a",
  c: "#a3e7a3",
  d: "#f8a4cc",
};

function Body({ id }: { id: string }) {
  return (
    <div
      style={{
        height: "100%",
        background: palette[id] ?? "#666",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#000",
        fontSize: 20,
        fontWeight: 600,
      }}
    >
      {id}
    </div>
  );
}

const makeTile = (id: string, title = id): TilingTile => ({
  title,
  render: () => <Body id={id} />,
});

function GridShell({
  initialIds = ["a", "b", "c", "d"],
}: {
  initialIds?: string[];
}) {
  const [tiles, setTiles] = useState<Record<string, TilingTile>>(() =>
    Object.fromEntries(initialIds.map((id) => [id, makeTile(id)])),
  );
  const [layout, setLayout] = useState<MosaicNode<string> | null>(() =>
    autoLayout(initialIds),
  );
  const [focused, setFocused] = useState<string | null>(null);
  const [counter, setCounter] = useState(initialIds.length);

  const onChange = useCallback((next: MosaicNode<string> | null) => {
    setLayout(next);
    const present = new Set(collectTileIds(next));
    setTiles((prev) => {
      const out: Record<string, TilingTile> = {};
      for (const [id, t] of Object.entries(prev)) {
        if (present.has(id)) out[id] = t;
      }
      return out;
    });
    setFocused((cur) => (cur && present.has(cur) ? cur : null));
  }, []);

  const spawn = useCallback(() => {
    const id = String.fromCharCode(97 + counter); // a, b, c, ...
    setCounter((c) => c + 1);
    setTiles((prev) => ({ ...prev, [id]: makeTile(id) }));
    setLayout((prev) => addTileToLayout(prev, id, focused));
    setFocused(id);
  }, [counter, focused]);

  return (
    <TilingProvider>
      <div
        style={{
          height: "calc(100vh - 32px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: 8 }}>
          <button onClick={spawn}>Add tile</button>
          {focused && (
            <span
              style={{
                marginLeft: 12,
                color: "var(--color-content-text-muted)",
              }}
            >
              focused: {focused}
            </span>
          )}
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <MosaicGrid
            tiles={tiles}
            value={layout}
            onChange={onChange}
            focusedTileId={focused}
            onFocusTile={setFocused}
          />
        </div>
      </div>
    </TilingProvider>
  );
}

export const Default: Story = { render: () => <GridShell /> };

export const SingleTile: Story = {
  render: () => <GridShell initialIds={["a"]} />,
};

export const EmptyState: Story = {
  render: () => <GridShell initialIds={[]} />,
};
