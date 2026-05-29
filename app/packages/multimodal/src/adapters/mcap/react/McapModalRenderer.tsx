import type { SampleRendererProps } from "@fiftyone/plugins";
import type { Track } from "@fiftyone/playback";
import React, { useCallback, useMemo } from "react";

const NO_TRACKS: Track[] = [];
import MultiModalPlayback from "../../../components/MultiModalPlayback/MultiModalPlayback";
import type { TemporalTagCreatePayload } from "@fiftyone/playback";
import { useSampleRendererTemporalTags } from "../../../temporal-tags";
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
  const { create, delete: deleteTags, temporalTags } = useSampleRendererTemporalTags(ctx);

  const onTagDelete = useCallback(
    async (event: { data?: unknown }) => {
      const id = event.data;
      if (typeof id === "string") await deleteTags([id]);
    },
    [deleteTags]
  );

  const onTagCreate = useCallback(
    (tag: TemporalTagCreatePayload) =>
      create([
        {
          ...tag,
          start: Math.round(tag.start * 1_000_000_000),
          end: Math.round(tag.end * 1_000_000_000),
        },
      ]).then(() => undefined),
    [create]
  );

  // One track per unique tag label. Events on each track are all time
  // ranges that share that label.
  const tagTracks = useMemo<Track[]>(() => {
    if (temporalTags.length === 0) return NO_TRACKS;

    const TAG_COLORS = [
      "#f97316",
      "#3b82f6",
      "#10b981",
      "#8b5cf6",
      "#f43f5e",
      "#f59e0b",
      "#06b6d4",
      "#ec4899",
    ];

    const byLabel = new Map<string, (typeof temporalTags)[number][]>();
    for (const t of temporalTags) {
      const group = byLabel.get(t.tag) ?? [];
      group.push(t);
      byLabel.set(t.tag, group);
    }

    // Sort label groups newest-first so recently created tags appear at the
    // top of the pinned section.
    const sorted = Array.from(byLabel.entries()).sort(([, a], [, b]) => {
      const tA = Math.max(...a.map((t) => t.createdAt ? Date.parse(t.createdAt) : 0));
      const tB = Math.max(...b.map((t) => t.createdAt ? Date.parse(t.createdAt) : 0));
      return tB - tA;
    });

    return sorted.map(([label, events]) => ({
      id: `temporal-tag::${label}`,
      label,
      color: TAG_COLORS[hashLabel(label) % TAG_COLORS.length],
      events: events.map((t) => ({
        data: t.id,
        label: t.tag,
        startSec: t.start / 1_000_000_000,
        endSec: t.end / 1_000_000_000,
      })),
    }));
  }, [temporalTags]);

  return (
    <McapDataStreamProvider>
      <MultiModalPlayback
        fileName={fileName}
        sceneSources={sceneSources}
        initialTiles={initialTiles}
        tracks={tagTracks.length > 0 ? tagTracks : undefined}
        onTagDelete={onTagDelete}
        defaultLeftOpen={false}
        defaultRightOpen={false}
        onTagCreate={onTagCreate}
      >
        <McapStreams ctx={ctx} />
      </MultiModalPlayback>
    </McapDataStreamProvider>
  );
};

export default McapModalRenderer;

function hashLabel(label: string): number {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return hash;
}
