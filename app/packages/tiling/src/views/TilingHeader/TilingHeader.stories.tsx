import type { Meta, StoryObj } from "@storybook/react";
import { IconName } from "@voxel51/voodo";
import { useEffect, useState } from "react";
import { TilingProvider } from "../../lib/TilingProvider";
import { useTileRegistry } from "../../lib/use-tile-registry";
import TilingHeader from "./TilingHeader";

const meta: Meta<typeof TilingHeader> = {
  title: "Tiling/Components/TilingHeader",
  component: TilingHeader,
};
export default meta;

type Story = StoryObj<typeof TilingHeader>;

const DummyTile: React.FC = () => (
  <div
    style={{
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "var(--color-content-text-muted)",
    }}
  >
    tile body
  </div>
);

function RegisterTiles() {
  const { registerTile } = useTileRegistry();
  useEffect(() => {
    const disposes = [
      registerTile({
        streamId: "camera_front",
        type: "camera",
        typeLabel: "Camera",
        title: "Camera front",
        icon: IconName.GridView,
        Tile: DummyTile,
      }),
      registerTile({
        streamId: "lidar_top",
        type: "lidar",
        typeLabel: "Lidar",
        title: "Lidar top",
        icon: IconName.Embeddings,
        Tile: DummyTile,
      }),
      registerTile({
        streamId: "imu",
        type: "graph",
        typeLabel: "Graph",
        title: "IMU",
        icon: IconName.Logs,
        Tile: DummyTile,
      }),
    ];
    return () => {
      for (const d of disposes) d();
    };
  }, [registerTile]);
  return null;
}

function Shell({
  fileName = "session.fo",
  withSidebars = true,
}: {
  fileName?: string;
  withSidebars?: boolean;
}) {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  return (
    <TilingProvider>
      <RegisterTiles />
      <div style={{ width: 960 }}>
        <TilingHeader
          fileName={fileName}
          leftSidebarOpen={withSidebars ? leftOpen : undefined}
          rightSidebarOpen={withSidebars ? rightOpen : undefined}
          onToggleLeftSidebar={
            withSidebars ? () => setLeftOpen((v) => !v) : undefined
          }
          onToggleRightSidebar={
            withSidebars ? () => setRightOpen((v) => !v) : undefined
          }
        />
      </div>
    </TilingProvider>
  );
}

export const WithAllControls: Story = {
  render: () => <Shell />,
};

export const NoSidebarToggles: Story = {
  render: () => <Shell withSidebars={false} />,
};

export const LongFilename: Story = {
  render: () => (
    <Shell fileName="a-really-long-session-name-that-should-be-elided.fo" />
  ),
};
