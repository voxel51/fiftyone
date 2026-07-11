import type { SampleRendererProps } from "@fiftyone/plugins";
import React from "react";
import { McapAdjacentSamplePrewarm } from "./McapAdjacentSamplePrewarm";
import { McapSourcePlayback } from "./McapSourcePlayback";
import { mcapSourceDisplayName } from "./mcap-source-display-name";
import { useMcapResourceClient } from "./use-mcap-resource-client";
import { useMcapTemporalTags } from "./use-mcap-temporal-tags";
import { useStableMcapSource } from "./use-stable-mcap-source";

/**
 * SampleRenderer wrapper for `.mcap` files. It translates the sample renderer
 * context into a byte source, then delegates the actual playback shell to the
 * source-oriented host shared with the ad hoc MCAP panel.
 */
const McapModalRenderer: React.FC<SampleRendererProps> = ({ ctx }) => {
  const client = useMcapResourceClient({ worker: true });
  const source = useStableMcapSource(ctx);
  const fileName = mcapSourceDisplayName(ctx.media.path) ?? "recording.mcap";
  const datasetId = ctx.dataset.datasetId;
  const { tracks, onTagCreate, onTagDelete } = useMcapTemporalTags(ctx);

  return (
    <McapSourcePlayback
      client={client}
      fileName={fileName}
      latencyLabel="mcap modal"
      latencySourceKey={
        typeof ctx.media.path === "string" ? ctx.media.path : undefined
      }
      layoutScopeKey={datasetId}
      onTagCreate={onTagCreate}
      onTagDelete={onTagDelete}
      navigationPending={ctx.transitioning === true}
      source={source}
      tracks={tracks}
    >
      <McapAdjacentSamplePrewarm ctx={ctx} />
    </McapSourcePlayback>
  );
};

export default McapModalRenderer;
