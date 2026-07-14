import { Checkbox, Text, TextColor, TextVariant } from "@voxel51/voodo";
import type { Meta, StoryObj } from "@storybook/react";
import { useEffect } from "react";
import {
  TileIdScope,
  TileSettingsContent,
  TilingProvider,
  useTiling,
} from "../../lib/TilingProvider";
import TileSettingsSidebar from "./TileSettingsSidebar";

const meta: Meta<typeof TileSettingsSidebar> = {
  title: "Tiling/Components/TileSettingsSidebar",
  component: TileSettingsSidebar,
};
export default meta;

type Story = StoryObj<typeof TileSettingsSidebar>;

/** Stand-in tile body — renders its settings JSX via the portal. */
const TileBody: React.FC = () => (
  <TileSettingsContent>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
        Source
      </Text>
      <select defaultValue="camera_front">
        <option value="camera_front">Camera front</option>
        <option value="camera_back">Camera back</option>
      </select>
      <Checkbox label="Show overlays" defaultChecked />
      <Checkbox label="Show bounding boxes" />
    </div>
  </TileSettingsContent>
);

function AutoFocus({ id }: { id: string }) {
  const { setFocusedTileId } = useTiling();
  // setFocusedTileId is a stable useState setter; omitted from deps per project convention.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setFocusedTileId(id), [id]);
  return null;
}

export const Empty: Story = {
  render: () => (
    <TilingProvider>
      <div style={{ width: 280, height: 320, display: "flex" }}>
        <TileSettingsSidebar />
      </div>
    </TilingProvider>
  ),
};

export const FocusedTile: Story = {
  render: () => (
    <TilingProvider
      initialTiles={{
        "camera-1": { title: "camera_front", render: () => null },
      }}
    >
      <TileIdScope tileId="camera-1">
        <TileBody />
      </TileIdScope>
      <AutoFocus id="camera-1" />
      <div style={{ width: 280, height: 320, display: "flex" }}>
        <TileSettingsSidebar />
      </div>
    </TilingProvider>
  ),
};
