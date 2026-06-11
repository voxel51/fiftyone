import type { SampleRendererProps } from "@fiftyone/plugins";
import React from "react";
import MultiModalPlayback from "../../../components/MultiModalPlayback/MultiModalPlayback";
import { McapDataStreamProvider } from "./mcap-data-stream-context";
import { McapStreams } from "./McapStreams";
import {
  McapModalLayoutPersistence,
  useMcapModalLayout,
} from "./use-mcap-modal-layout";
import { useMcapSceneInventory } from "./use-mcap-scene-inventory";
import { useStableMcapSource } from "./use-stable-mcap-source";
import { useMcapTemporalTags } from "./use-mcap-temporal-tags";

/**
 * SampleRenderer for `.mcap` files. Composes the playback shell, the
 * MCAP data-stream provider (so the setup hook and tile bodies share
 * one handle), and the non-visual `McapStreams` that wires the
 * scene-inventory + middleware together.
 *
 * Sidebar visibility and the tile arrangement restore from the user's
 * last session (`useMcapModalLayout`) and persist as they change
 * (`McapModalLayoutPersistence`).
 */
const McapModalRenderer: React.FC<SampleRendererProps> = ({ ctx }) => {
  const source = useStableMcapSource(ctx);
  const fileName = source?.sourceId.split("/").pop() ?? "recording.mcap";
  const sceneSources = useMcapSceneInventory(fileName);
  const {
    initialTiles,
    initialLayout,
    defaultLeftOpen,
    defaultRightOpen,
    onLeftOpenChange,
    onRightOpenChange,
  } = useMcapModalLayout(fileName);
  const { tracks, onTagCreate, onTagDelete } = useMcapTemporalTags(ctx);

  return (
    <McapDataStreamProvider>
      <MultiModalPlayback
        fileName={fileName}
        sceneSources={sceneSources}
        initialTiles={initialTiles}
        initialLayout={initialLayout}
        tracks={tracks.length > 0 ? tracks : undefined}
        onTagDelete={onTagDelete}
        defaultLeftOpen={defaultLeftOpen}
        defaultRightOpen={defaultRightOpen}
        onLeftOpenChange={onLeftOpenChange}
        onRightOpenChange={onRightOpenChange}
        onTagCreate={onTagCreate}
      >
        <McapStreams ctx={ctx} />
        <McapModalLayoutPersistence />
      </MultiModalPlayback>
    </McapDataStreamProvider>
  );
};

export default McapModalRenderer;
