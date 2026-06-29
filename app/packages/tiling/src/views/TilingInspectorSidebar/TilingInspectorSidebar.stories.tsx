import type { Meta, StoryObj } from "@storybook/react";
import { useEffect } from "react";
import {
  TileIdScope,
  TilingProvider,
  useTiling,
} from "../../lib/TilingProvider";
import { useSetTileSelection } from "../../lib/use-tile-state";
import TilingInspectorSidebar from "./TilingInspectorSidebar";

const meta: Meta<typeof TilingInspectorSidebar> = {
  title: "Tiling/Components/TilingInspectorSidebar",
  component: TilingInspectorSidebar,
};
export default meta;

type Story = StoryObj<typeof TilingInspectorSidebar>;

function AutoFocus({ id }: { id: string }) {
  const { setFocusedTileId } = useTiling();
  // setFocusedTileId is a stable useState setter; omitted from deps per project convention.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setFocusedTileId(id), [id]);
  return null;
}

function EmitSelection({ payload }: { payload: unknown }) {
  const setSelection = useSetTileSelection();
  // setSelection is stable (useCallback with empty deps); omitted per project convention.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setSelection(payload), [payload]);
  return null;
}

export const Empty: Story = {
  render: () => (
    <TilingProvider>
      <div style={{ width: 280, height: 320, display: "flex" }}>
        <TilingInspectorSidebar />
      </div>
    </TilingProvider>
  ),
};

export const FocusedTileNoSelection: Story = {
  render: () => (
    <TilingProvider
      initialTiles={{ "graph-1": { title: "imu", render: () => null } }}
    >
      <AutoFocus id="graph-1" />
      <div style={{ width: 280, height: 320, display: "flex" }}>
        <TilingInspectorSidebar />
      </div>
    </TilingProvider>
  ),
};

export const WithSelectionPayload: Story = {
  render: () => (
    <TilingProvider
      initialTiles={{ "graph-1": { title: "imu", render: () => null } }}
    >
      <TileIdScope tileId="graph-1">
        <EmitSelection
          payload={{
            kind: "graph-sample",
            timeSec: 3.42,
            ratio: 0.285,
            values: { velocity: 0.71, accel: 0.13 },
          }}
        />
      </TileIdScope>
      <AutoFocus id="graph-1" />
      <div style={{ width: 280, height: 360, display: "flex" }}>
        <TilingInspectorSidebar />
      </div>
    </TilingProvider>
  ),
};
