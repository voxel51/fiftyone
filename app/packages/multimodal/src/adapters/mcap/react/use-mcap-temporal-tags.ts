import type { SampleRendererProps } from "@fiftyone/plugins";
import type { Track } from "@fiftyone/playback";
import type { TemporalTagCreatePayload } from "@fiftyone/playback";
import { useCallback, useMemo } from "react";
import { useSampleRendererTemporalTags } from "../../../temporal-tags";

const NO_TRACKS: Track[] = [];

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

function hashLabel(label: string): number {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export interface McapTemporalTagsResult {
  tracks: Track[];
  onTagCreate: (tag: TemporalTagCreatePayload) => Promise<void>;
  onTagDelete: (event: { data?: unknown }) => Promise<void>;
}

export function useMcapTemporalTags(
  ctx: SampleRendererProps["ctx"]
): McapTemporalTagsResult {
  const { create, delete: deleteTags, temporalTags } =
    useSampleRendererTemporalTags(ctx);

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

  const tracks = useMemo<Track[]>(() => {
    if (temporalTags.length === 0) return NO_TRACKS;

    const byLabel = new Map<string, (typeof temporalTags)[number][]>();
    for (const t of temporalTags) {
      const group = byLabel.get(t.tag) ?? [];
      group.push(t);
      byLabel.set(t.tag, group);
    }

    // Sort label groups newest-first so recently created tags appear at the
    // top of the pinned section.
    const sorted = Array.from(byLabel.entries()).sort(([, a], [, b]) => {
      const tA = Math.max(...a.map((t) => (t.createdAt ? Date.parse(t.createdAt) : 0)));
      const tB = Math.max(...b.map((t) => (t.createdAt ? Date.parse(t.createdAt) : 0)));
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

  return { tracks, onTagCreate, onTagDelete };
}
