import {
  EPISODE_UNIT,
  selectionScopeLabel,
  type EpisodeSelection,
  type SavedSubset,
  type SelectionCounts,
  type SelectionMember,
  type SelectionRange,
  type SelectionUnit,
} from "@fiftyone/state/src/selection";

export type SegmentMember = Extract<SelectionMember, { kind: "segment" }>;

/** "1 segment", "3 segments". */
export function plural(count: number, unit: string, units = `${unit}s`) {
  return `${count.toLocaleString()} ${count === 1 ? unit : units}`;
}

/** Saved identities, without fetching live availability or distinct parents. */
export function savedSubsetLabel(subset: SavedSubset, unit: SelectionUnit) {
  const { fullEpisodes, segments } = subset.memberCounts;
  if (!segments) return plural(subset.memberCount, unit.one, unit.many);
  if (!fullEpisodes) return plural(subset.memberCount, "segment");
  return `${plural(fullEpisodes, unit.one, unit.many)} and ${plural(segments, "segment")}`;
}

/** "Episode", "Sample", "Patch": the unit for titles and menu copy. */
export function unitTitle(unit: SelectionUnit) {
  return unit.one.charAt(0).toUpperCase() + unit.one.slice(1);
}

/**
 * Names a frozen scope inside a panel title: "all 16 samples in view" for
 * every current result, "3 selected samples" for an explicit selection, and
 * "3 selected samples in Keep" when the selection is one named bucket.
 */
export function scopePhrase(
  source: "explicit" | "results",
  counts: SelectionCounts,
  unit: SelectionUnit,
  within?: string,
) {
  const label = selectionScopeLabel(counts, unit);
  if (source === "results") return `all ${label} in view`;
  const suffix = within ? ` in ${within}` : "";
  if (counts.segments || counts.groups) return `selected ${label}${suffix}`;
  const noun = counts.fullEpisodes === 1 ? unit.one : unit.many;
  return `${counts.fullEpisodes} selected ${noun}${suffix}`;
}

/** The archetype a selection pill aggregates: whole parents or segments. */
export type SelectionKind = "episode" | "segment";

/** Count and wording for one independently clearable selection kind. */
export interface SelectionPill {
  readonly kind: SelectionKind;
  readonly count: number;
  /** "sample", "episodes", "segment": the exact noun, already pluralized. */
  readonly noun: string;
  /** Fuller wording for the tooltip: "2 full episodes", "3 segments across 2 episodes". */
  readonly detail: string;
}

/**
 * One pill per archetype in the selection: whole parents in the unit's own
 * noun (samples, clips, frames, patches, episodes) and, for temporal media,
 * a second pill aggregating segments. The count and noun read as
 * "4 samples selected"; the detail carries the qualifiers the pill omits.
 */
export function selectionPills(
  counts: SelectionCounts,
  unit: SelectionUnit,
): SelectionPill[] {
  const pills: SelectionPill[] = [];
  const mixed = counts.fullEpisodes > 0 && counts.segments > 0;
  if (counts.fullEpisodes > 0)
    pills.push({
      kind: "episode",
      count: counts.fullEpisodes,
      noun: counts.fullEpisodes === 1 ? unit.one : unit.many,
      detail:
        mixed && unit.temporal
          ? plural(counts.fullEpisodes, `full ${unit.one}`, `full ${unit.many}`)
          : plural(counts.fullEpisodes, unit.one, unit.many),
    });
  if (counts.segments > 0)
    pills.push({
      kind: "segment",
      count: counts.segments,
      noun: counts.segments === 1 ? "segment" : "segments",
      detail: `${plural(counts.segments, "segment")} across ${plural(
        counts.segmentEpisodes,
        unit.one,
        unit.many,
      )}`,
    });
  return pills;
}

/** "Episodes", "Samples", "Patches". */
export function unitTitlePlural(unit: SelectionUnit) {
  return unit.many.charAt(0).toUpperCase() + unit.many.slice(1);
}

export function segmentsOf(
  group: Pick<EpisodeSelection, "members">,
): SegmentMember[] {
  return group.members.filter(
    (member): member is SegmentMember => member.kind === "segment",
  );
}

export function isFullEpisode(group: Pick<EpisodeSelection, "members">) {
  return (
    Boolean("group" in group && group.group) ||
    group.members.some((member) => member.kind === "episode")
  );
}

/** The card descriptor: "Full episode", "Sample", or "N segments". */
export function groupDescriptor(
  group: Pick<EpisodeSelection, "members">,
  unit: SelectionUnit = EPISODE_UNIT,
) {
  if (isFullEpisode(group))
    return unit.temporal ? `Full ${unit.one}` : unitTitle(unit);
  return plural(segmentsOf(group).length, "segment");
}

/** A human title for a parent: its media file name when known. */
export function episodeTitle(
  group: Pick<EpisodeSelection, "episodeId" | "filepath">,
  unit: SelectionUnit = EPISODE_UNIT,
) {
  if (!group.filepath) return `${unitTitle(unit)} ${group.episodeId.slice(-6)}`;
  return group.filepath.split(/[\\/]/).pop() || group.filepath;
}

export const INTEGER = /^-?\d+$/;

function clock(totalMs: number) {
  const sign = totalMs < 0 ? "-" : "";
  const ms = Math.abs(totalMs);
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = ((ms % 60_000) / 1000).toFixed(1).padStart(4, "0");
  return hours
    ? `${sign}${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${sign}${minutes}:${seconds}`;
}

/** Format one bound on the episode's native axis for display only. */
export function formatBound(value: string, timebase: string): string {
  if (!INTEGER.test(value)) return value;
  if (timebase === "sequence") return BigInt(value).toLocaleString();
  if (timebase === "duration-ns")
    return clock(Number(BigInt(value) / 1_000_000n));
  if (timebase === "timestamp-ns") {
    const date = new Date(Number(BigInt(value) / 1_000_000n));
    return Number.isNaN(date.getTime())
      ? value
      : date.toISOString().slice(11, 21);
  }
  return value;
}

/** Unit suffix for a timebase, or an empty string when the format implies it. */
export function rangeUnit(timebase: string) {
  if (timebase === "sequence") return "frames";
  if (timebase === "duration-ns") return "";
  if (timebase === "timestamp-ns") return "UTC";
  return timebase;
}

export function formatRange(
  range: Pick<SelectionRange, "start" | "end" | "timebase">,
) {
  return `${formatBound(range.start, range.timebase)}–${formatBound(
    range.end,
    range.timebase,
  )}`;
}

function byStart(a: SegmentMember, b: SegmentMember) {
  if (!INTEGER.test(a.range.start) || !INTEGER.test(b.range.start))
    return a.range.start.localeCompare(b.range.start);
  const left = BigInt(a.range.start);
  const right = BigInt(b.range.start);
  return left < right ? -1 : left > right ? 1 : 0;
}

/** "10–30, 60–75 frames", truncating long lists with a remainder count. */
export function formatRanges(members: readonly SegmentMember[], max = 3) {
  if (!members.length) return "";
  const sorted = [...members].sort(byStart);
  const shown = sorted.slice(0, max).map((member) => formatRange(member.range));
  const rest = sorted.length - shown.length;
  const timebases = new Set(sorted.map((member) => member.range.timebase));
  const unit = timebases.size === 1 ? rangeUnit(sorted[0].range.timebase) : "";
  return [shown.join(", ") + (rest > 0 ? ` +${rest} more` : ""), unit]
    .filter(Boolean)
    .join(" ");
}

/** Every range on its own line, for tooltips and read-only summaries. */
export function listRanges(members: readonly SegmentMember[]) {
  return [...members].sort(byStart).map((member) => {
    const unit = rangeUnit(member.range.timebase);
    return `${formatRange(member.range)}${unit ? ` ${unit}` : ""}`;
  });
}

/** The trailing path of a stream id: "lerobot:observation.images.side" → "observation.images.side". */
export function shortStream(stream: string) {
  const parts = stream.split(/[:/]/).filter(Boolean);
  return parts[parts.length - 1] ?? stream;
}

/**
 * Stream scope label, or null when the only stream is the media file itself
 * and there is nothing to disambiguate.
 */
export function streamsLabel(members: readonly SegmentMember[]) {
  const streams = new Set(members.flatMap((member) => member.range.streams));
  if (!streams.size) return null;
  if (streams.size === 1) {
    const [only] = [...streams];
    return only === "filepath" ? null : shortStream(only);
  }
  return plural(streams.size, "stream");
}

/** Shared numeric domain for drawing several range sets on one axis. */
export function rangeDomain(
  sets: readonly (readonly SegmentMember[])[],
): [bigint, bigint] | null {
  let min: bigint | null = null;
  let max: bigint | null = null;
  for (const members of sets)
    for (const { range } of members) {
      if (!INTEGER.test(range.start) || !INTEGER.test(range.end)) continue;
      const start = BigInt(range.start);
      const end = BigInt(range.end);
      if (min === null || start < min) min = start;
      if (max === null || end > max) max = end;
    }
  return min === null || max === null ? null : [min, max];
}
