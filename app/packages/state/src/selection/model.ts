import type {
  EpisodeSelection,
  SelectionCounts,
  SelectionMember,
} from "./types";

/** Identity excludes provenance, display formatting, and provider order. */
export function selectionMemberKey(member: SelectionMember): string {
  if (member.kind === "episode")
    return JSON.stringify([member.episodeId, member.kind]);
  const { start, end, timebase, streams } = member.range;
  return JSON.stringify([
    member.episodeId,
    member.kind,
    timebase,
    BigInt(start).toString(),
    BigInt(end).toString(),
    [...new Set(streams)].sort(),
  ]);
}

/** Normalize exact identities, retaining overlapping ranges and all source evidence. */
export function normalizeSelectionMembers(
  members: readonly SelectionMember[],
): SelectionMember[] {
  const result = new Map<string, SelectionMember>();
  for (const member of members) {
    if (member.kind === "segment") {
      const { range } = member;
      if (
        !/^-?\d+$/.test(range.start) ||
        !/^-?\d+$/.test(range.end) ||
        BigInt(range.start) >= BigInt(range.end) ||
        !range.timebase ||
        !range.streams.length
      ) {
        throw new Error(
          "Segments require a nonempty half-open range, timebase, and resolved streams",
        );
      }
      const key = selectionMemberKey(member);
      const previous = result.get(key);
      const provenance = [
        ...(previous?.kind === "segment" ? previous.range.provenance : []),
        ...range.provenance,
      ];
      const sources = new Map(
        provenance.map((source) => [
          JSON.stringify([
            source.provider,
            source.source,
            source.itemId,
            source.nativeStart,
            source.nativeEnd,
          ]),
          source,
        ]),
      );
      result.set(key, {
        ...member,
        range: {
          ...range,
          start: BigInt(range.start).toString(),
          end: BigInt(range.end).toString(),
          streams: [...new Set(range.streams)].sort(),
          provenance: [...sources.values()],
        },
      });
    } else {
      result.set(selectionMemberKey(member), member);
    }
  }
  return [...result.values()];
}

/** Compare captured membership without treating provenance changes as mismatches. */
export function sameSelection(
  left: EpisodeSelection,
  right: EpisodeSelection,
): boolean {
  const a = new Set(left.members.map(selectionMemberKey));
  const b = new Set(right.members.map(selectionMemberKey));
  return a.size === b.size && [...a].every((key) => b.has(key));
}

/** Replace explicitly, or accumulate segments without expanding a full-episode capture. */
export function updateEpisodeSelection(
  current: EpisodeSelection | undefined,
  candidate: EpisodeSelection,
  operation: "replace" | "add",
): EpisodeSelection {
  if (operation === "add" && current) {
    if (
      current.members.some((m) => m.kind === "episode") ||
      candidate.members.some((m) => m.kind === "episode")
    )
      return current;
    return {
      ...current,
      members: normalizeSelectionMembers([
        ...current.members,
        ...candidate.members,
      ]),
    };
  }
  if (
    !candidate.members.length ||
    candidate.members.some((m) => m.episodeId !== candidate.episodeId)
  )
    throw new Error("An episode capture must contain its own members");
  if (
    candidate.members.some((m) => m.kind === "episode") &&
    candidate.members.some((m) => m.kind === "segment")
  )
    throw new Error(
      "A tray card must select either the full episode or segments",
    );
  return {
    ...candidate,
    members: normalizeSelectionMembers(candidate.members),
  };
}

/** Summarize grouped cards without confusing card count with action scope. */
export function countSelection(
  groups: readonly EpisodeSelection[],
): SelectionCounts {
  let fullEpisodes = 0,
    segments = 0,
    segmentEpisodes = 0,
    unavailable = 0;
  for (const group of groups) {
    const count = group.members.filter((m) => m.kind === "segment").length;
    segments += count;
    segmentEpisodes += Number(count > 0);
    fullEpisodes += group.members.filter((m) => m.kind === "episode").length;
    unavailable += group.unavailable ? group.members.length : 0;
  }
  return {
    episodes: groups.length,
    fullEpisodes,
    segments,
    segmentEpisodes,
    unavailable,
  };
}

/** Vocabulary for the parent unit of a selection scope. */
export interface SelectionUnit {
  readonly one: string;
  readonly many: string;
  /** Whether segments within the parent are meaningful. */
  readonly temporal: boolean;
}

export const EPISODE_UNIT: SelectionUnit = {
  one: "episode",
  many: "episodes",
  temporal: true,
};
export const SAMPLE_UNIT: SelectionUnit = {
  one: "sample",
  many: "samples",
  temporal: false,
};

/** Which converted view a stage list produces. */
export type ViewConversion = "patches" | "frames" | "clips";

const CONVERTED_UNITS: Record<ViewConversion, SelectionUnit> = {
  patches: { one: "patch", many: "patches", temporal: false },
  frames: { one: "frame", many: "frames", temporal: false },
  clips: { one: "clip", many: "clips", temporal: false },
};

const CONVERTING_STAGES: Record<string, ViewConversion> = {
  "fiftyone.core.stages.ToPatches": "patches",
  "fiftyone.core.stages.ToEvaluationPatches": "patches",
  "fiftyone.core.stages.ToFrames": "frames",
  "fiftyone.core.stages.ToClips": "clips",
  "fiftyone.core.stages.ToTrajectories": "clips",
};

/**
 * The last converting stage in a view, with a key naming its exact
 * configuration, or null for a samples view.
 */
export function viewConversion(
  stages: readonly unknown[],
): { kind: ViewConversion; key: string } | null {
  let found: { kind: ViewConversion; key: string } | null = null;
  for (const stage of stages) {
    if (typeof stage !== "object" || stage === null) continue;
    const { _cls, kwargs } = stage as { _cls?: unknown; kwargs?: unknown };
    if (typeof _cls !== "string") continue;
    const kind = CONVERTING_STAGES[_cls];
    if (kind)
      found = { kind, key: `${_cls}:${JSON.stringify(kwargs ?? null)}` };
  }
  return found;
}

/** Temporal media speaks in episodes; converted views in their own element. */
export function selectionUnit(
  mediaType: string,
  conversion: ViewConversion | null = null,
): SelectionUnit {
  if (conversion) return CONVERTED_UNITS[conversion];
  return mediaType === "video" || mediaType === "multimodal"
    ? EPISODE_UNIT
    : SAMPLE_UNIT;
}

/** Captures are isolated per dataset and, in converted views, per conversion. */
export function selectionDomainId(
  datasetId: string,
  conversionKey: string | null,
) {
  return conversionKey ? `${datasetId}|${conversionKey}` : datasetId;
}

/** Converted views regenerate their ids, so only the samples view persists. */
export function isPersistentDomain(domainId: string) {
  return !domainId.includes("|");
}

function count(value: number, unit: string, units = `${unit}s`) {
  return `${value} ${value === 1 ? unit : units}`;
}

/** Human-readable units shared by the tray and action previews. */
export function selectionScopeLabel(
  counts: SelectionCounts,
  unit: SelectionUnit = EPISODE_UNIT,
): string {
  const parts = [];
  if (counts.fullEpisodes)
    parts.push(
      unit.temporal
        ? count(counts.fullEpisodes, "full episode")
        : count(counts.fullEpisodes, unit.one, unit.many),
    );
  if (counts.segments)
    parts.push(
      `${count(counts.segments, "segment")} across ${count(
        counts.segmentEpisodes,
        unit.one,
        unit.many,
      )}`,
    );
  return parts.join(" · ") || (unit.temporal ? "0 members" : `0 ${unit.many}`);
}
