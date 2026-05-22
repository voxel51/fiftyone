import type { SampleRendererProps } from "@fiftyone/plugins";
import React from "react";
import MultiModalPlayback from "../../../components/MultiModalPlayback/MultiModalPlayback";
import { McapDataStreamProvider } from "./mcap-data-stream-context";
import { McapStreams } from "./McapStreams";
import {
  useMcapInitialTiles,
  useMcapSceneInventory,
} from "./use-mcap-scene-inventory";
import { useStableMcapSource } from "./use-stable-mcap-source";

/**
 * SampleRenderer for `.mcap` files. Composes the playback shell, the
 * MCAP data-stream provider (so the setup hook and tile bodies share
 * one handle), and the non-visual `McapStreams` that wires the
 * scene-inventory + middleware together.
 */
const McapModalRenderer: React.FC<SampleRendererProps> = ({ ctx }) => {
  const source = useStableMcapSource(ctx);
  const fileName = source?.sourceId.split("/").pop() ?? "recording.mcap";
  const sceneSources = useMcapSceneInventory(fileName);
  const initialTiles = useMcapInitialTiles(fileName);

  return (
    <McapDataStreamProvider>
      <MultiModalPlayback
        fileName={fileName}
        sceneSources={sceneSources}
        initialTiles={initialTiles}
        defaultLeftOpen={false}
        defaultRightOpen={false}
      >
        <McapStreams ctx={ctx} />
      </MultiModalPlayback>
    </McapDataStreamProvider>
  );
};

export default McapModalRenderer;
