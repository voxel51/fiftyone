import {
  STREAM_KIND,
  type EpisodeManifest,
  type StreamDescriptor,
  type StreamKind,
  type TimeDomain,
  type TimeWindow,
} from "../../ir";
import type { SceneInventory, StreamInventory } from "./contracts";

/** Options for mapping a generated stream inventory into Tier-2 IR. */
export interface StreamInventoryIrOptions {
  readonly kind?: StreamKind;
  readonly timeRange: TimeWindow;
}

/** Maps a generated stream inventory into the standalone structural IR. */
export function streamInventoryToIr(
  stream: StreamInventory,
  options: StreamInventoryIrOptions,
): StreamDescriptor {
  return {
    count: parseCount(stream.recordCount),
    id: stream.streamId,
    kind: options.kind ?? STREAM_KIND.UNKNOWN,
    metadata: stream.metadata,
    payload: {
      encoding: stream.payload?.encoding ?? "unknown",
      schema: stream.payload?.schema,
      schemaEncoding: stream.payload?.schemaEncoding,
    },
    sourceName:
      stream.displayName ?? stream.metadata.sourceName ?? stream.streamId,
    timeRange: options.timeRange,
  };
}

/** Options for mapping a generated scene inventory into an episode manifest. */
export interface SceneInventoryIrOptions {
  readonly streamKinds?: Readonly<Record<string, StreamKind>>;
  readonly timeDomain: TimeDomain;
  readonly timeRange: TimeWindow;
}

/** Maps a generated scene inventory into cloneable Tier-2 episode IR. */
export function sceneInventoryToEpisodeManifest(
  inventory: SceneInventory,
  options: SceneInventoryIrOptions,
): EpisodeManifest {
  return {
    episodeId: inventory.sceneId,
    metadata: inventory.metadata,
    streams: inventory.streams.map((stream) =>
      streamInventoryToIr(stream, {
        kind: options.streamKinds?.[stream.streamId],
        timeRange: options.timeRange,
      }),
    ),
    timeDomain: options.timeDomain,
    timeRange: options.timeRange,
    transformTopology: {
      edges: inventory.staticCoordinateFrameEdges.map((edge) => ({
        childFrameId: edge.childFrameId,
        parentFrameId: edge.parentFrameId,
        sourceStreamId: edge.sourceStreamId || undefined,
      })),
    },
  };
}

function parseCount(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : undefined;
}
