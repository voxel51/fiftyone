import { Drawer } from "@voxel51/voodo";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import { useTiling } from "../../lib/TilingProvider";
import MosaicGrid from "../tiles/MosaicGrid";
import TileSettingsSidebar from "../TileSettingsSidebar/TileSettingsSidebar";
import TilingHeader from "../TilingHeader/TilingHeader";
import TilingInspectorSidebar from "../TilingInspectorSidebar/TilingInspectorSidebar";
import TimelineWithTracks from "../TimelineWithTracks/TimelineWithTracks";
import { MockStoryShell, useMockTracks } from "./utils";

const meta: Meta = { title: "Playback/MultiModalDemo" };
export default meta;

function DemoBody() {
  const tracks = useMockTracks();
  const { layout, tiles, focusedTileId, setLayout, setFocusedTileId } =
    useTiling();
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
      <TilingHeader
        fileName="multimodal_demo.fo"
        leftSidebarOpen={leftOpen}
        rightSidebarOpen={rightOpen}
        onToggleLeftSidebar={() => setLeftOpen((v) => !v)}
        onToggleRightSidebar={() => setRightOpen((v) => !v)}
      />

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
          <TileSettingsSidebar />
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
          <TilingInspectorSidebar />
        </Drawer>
      </div>

      <TimelineWithTracks tracks={tracks} />
    </div>
  );
}

export const Default: StoryObj = {
  render: () => (
    <PlaybackProvider>
      <MockStoryShell>
        <DemoBody />
      </MockStoryShell>
    </PlaybackProvider>
  ),
};
