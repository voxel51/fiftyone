import type { SampleRendererProps } from "@fiftyone/plugins";
import React from "react";
import { McapAdjacentSamplePrewarm } from "./McapAdjacentSamplePrewarm";
import { McapSourcePlayback } from "./McapSourcePlayback";
import { useMcapResourceClient } from "./use-mcap-resource-client";
import {
  useFilteredTemporalTagPinnedIds,
  useMcapTemporalTags,
} from "./use-mcap-temporal-tags";
import { useStableMcapSource } from "./use-stable-mcap-source";

/**
 * SampleRenderer wrapper for `.mcap` files. It translates the sample renderer
 * context into a byte source, then delegates the actual playback shell to the
 * source-oriented host shared with the ad hoc MCAP panel.
 */
const McapModalRenderer: React.FC<SampleRendererProps> = ({ ctx }) => {
  const client = useMcapResourceClient({ worker: true });
  const source = useStableMcapSource(ctx);
  const fileName = fileNameFromPath(ctx.media.path) ?? "recording.mcap";
  const datasetId = ctx.dataset.datasetId;
  const { tracks, onTagCreate, onTagDelete } = useMcapTemporalTags(ctx);
  // Auto-pin the timeline tracks for the temporal tags the grid was filtered
  // by, so opening a filtered sample surfaces the relevant tags immediately.
  const defaultPinnedTrackIds = useFilteredTemporalTagPinnedIds();

  return (
    <McapSourcePlayback
      client={client}
      defaultPinnedTrackIds={defaultPinnedTrackIds}
      fileName={fileName}
      latencyLabel="mcap modal"
      latencySourceKey={
        typeof ctx.media.path === "string" ? ctx.media.path : undefined
      }
      layoutScopeKey={datasetId}
      onTagCreate={onTagCreate}
      onTagDelete={onTagDelete}
      source={source}
      tracks={tracks}
    >
      <McapAdjacentSamplePrewarm ctx={ctx} />
    </McapSourcePlayback>
  );
};

function fileNameFromPath(path: unknown): string | null {
  if (typeof path !== "string" || !path) return null;
  return path.split(/[/\\]/).pop() || null;
}

export default McapModalRenderer;
