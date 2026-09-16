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

/** Parent unit vocabulary: temporal media has episodes, other media has samples. */
export type SelectionUnit = "episode" | "sample";

export function selectionUnit(mediaType: string): SelectionUnit {
  return mediaType === "video" || mediaType === "multimodal"
    ? "episode"
    : "sample";
}

function count(value: number, unit: string, units = `${unit}s`) {
  return `${value} ${value === 1 ? unit : units}`;
}

/** Human-readable units shared by the tray and action previews. */
export function selectionScopeLabel(
  counts: SelectionCounts,
  unit: SelectionUnit = "episode",
): string {
  const parts = [];
  if (counts.fullEpisodes)
    parts.push(
      unit === "episode"
        ? count(counts.fullEpisodes, "full episode")
        : count(counts.fullEpisodes, "sample"),
    );
  if (counts.segments)
    parts.push(
      `${count(counts.segments, "segment")} across ${count(
        counts.segmentEpisodes,
        unit,
      )}`,
    );
  return parts.join(" · ") || (unit === "episode" ? "0 members" : "0 samples");
}
