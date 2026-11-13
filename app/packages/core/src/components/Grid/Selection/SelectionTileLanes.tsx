import type { IntervalTileContext } from "@fiftyone/multimodal/extensions/episode-intervals";
import { NANOSECONDS_PER_SECOND } from "@fiftyone/multimodal/ir";
import { publishEpisodeTimeRange } from "@fiftyone/multimodal/runtime";
import * as fos from "@fiftyone/state";
import type { GridSampleNode } from "@fiftyone/state/src/selection";
import { useLayoutEffect, useMemo } from "react";
import { TileLanes } from "../TileLanes";

/** The grid's complete footer, shared by video and multimodal tray previews. */
export default function SelectionTileLanes({
  node,
  videoDuration,
}: {
  readonly node: GridSampleNode;
  readonly videoDuration?: number;
}) {
  const datasetId = fos.useCurrentDataset()?.datasetId;
  const episodeId = node.sample._id;
  const metadata = node.sample.metadata;
  const metadataDuration =
    (node.sample._media_type === "video" ||
      node.sample.media_type === "video") &&
    typeof metadata === "object" &&
    metadata !== null &&
    "duration" in metadata &&
    typeof metadata.duration === "number"
      ? metadata.duration
      : undefined;
  const duration = metadataDuration ?? videoDuration;
  // This effect publishes the native video's clock before the lanes draw.
  // Multimodal renderers publish their own recording clock.
  useLayoutEffect(() => {
    if (duration === undefined || duration <= 0 || !Number.isFinite(duration))
      return;
    publishEpisodeTimeRange(episodeId, {
      startNs: 0n,
      endNs: BigInt(Math.round(duration * Number(NANOSECONDS_PER_SECOND))),
    });
  }, [episodeId, duration]);
  const ctx = useMemo<IntervalTileContext | null>(
    () =>
      datasetId
        ? { dataset: { datasetId }, sample: node, surface: "grid" }
        : null,
    [datasetId, node],
  );
  return ctx ? <TileLanes ctx={ctx} /> : null;
}
