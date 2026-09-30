import type {
  EpisodeSelection,
  SelectionCounts,
  SelectionMember,
} from "./types";

/** Identity excludes provenance, display formatting, and provider order. */
export function selectionMemberKey(member: SelectionMember): string {
  if (member.kind === "episode" && member.reference) {
    const reference = Object.fromEntries(
      Object.entries(member.reference).sort(([a], [b]) => a.localeCompare(b)),
    );
    return JSON.stringify(["reference", reference]);
  }
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
            source.label,
            source.model,
            source.origin,
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
  if (left.group || right.group)
    return Boolean(
      left.group &&
      right.group &&
      left.group.size === right.group.size &&
      left.group.fingerprint === right.group.fingerprint,
    );
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
    if (current.group || candidate.group) return current;
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
    (!candidate.members.length && !candidate.group?.snapshotId) ||
    (!candidate.group &&
      candidate.members.some((m) => m.episodeId !== candidate.episodeId))
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

/** Complete action sources; group members never need to travel to the browser. */
export function capturedScopeSources(groups: readonly EpisodeSelection[]) {
  return {
    members: normalizeSelectionMembers(
      groups.flatMap((group) => group.members),
    ),
    snapshotIds: [
      ...new Set(
        groups.flatMap((group) =>
          group.group?.snapshotId ? [group.group.snapshotId] : [],
        ),
      ),
    ],
    ...(groups.some((group) => group.group) && {
      groupCount: new Set(
        groups
          .filter((group) => group.group)
          .map((group) => group.group?.key ?? group.episodeId),
      ).size,
    }),
  };
}

/** Summarize grouped cards without confusing card count with action scope. */
export function countSelection(
  groups: readonly EpisodeSelection[],
): SelectionCounts {
  const members = normalizeSelectionMembers(
    groups.flatMap((group) => group.members),
  );
  const unavailableIds = new Set(
    groups.filter((group) => group.unavailable).map((group) => group.episodeId),
  );
  return {
    episodes: new Set(members.map((member) => member.episodeId)).size,
    fullEpisodes: members.filter((member) => member.kind === "episode").length,
    segments: members.filter((member) => member.kind === "segment").length,
    segmentEpisodes: new Set(
      members
        .filter((member) => member.kind === "segment")
        .map((member) => member.episodeId),
    ).size,
    unavailable: members.filter((member) =>
      unavailableIds.has(member.episodeId),
    ).length,
    ...(groups.some((group) => group.group) && {
      groups: new Set(
        groups
          .filter((group) => group.group)
          .map((group) => group.group?.key ?? group.episodeId),
      ).size,
    }),
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
/** Videos are samples in FiftyOne's own words, with segments and temporal tags. */
export const VIDEO_UNIT: SelectionUnit = {
  one: "sample",
  many: "samples",
  temporal: true,
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
): { kind: ViewConversion; key: string; subsetId?: string } | null {
  let found: { kind: ViewConversion; key: string; subsetId?: string } | null =
    null;
  for (const stage of stages) {
    if (typeof stage !== "object" || stage === null) continue;
    const { _cls, kwargs } = stage as { _cls?: unknown; kwargs?: unknown };
    if (typeof _cls !== "string") continue;
    const kind = CONVERTING_STAGES[_cls];
    if (kind) {
      // Materialization hints can change while the server opens a subset.
      // They do not change which kind of source entities this scope contains.
      const configuration = Array.isArray(kwargs)
        ? kwargs.filter(
            (entry) => !Array.isArray(entry) || entry[0] !== "_state",
          )
        : kwargs;
      found = { kind, key: `${_cls}:${JSON.stringify(configuration ?? null)}` };
      const config: unknown = Array.isArray(configuration)
        ? configuration.find(
            (entry) => Array.isArray(entry) && entry[0] === "config",
          )?.[1]
        : undefined;
      if (
        config &&
        typeof config === "object" &&
        "_subset_id" in config &&
        typeof config._subset_id === "string"
      ) {
        found.subsetId = config._subset_id;
      }
    }
  }
  return found;
}

/** Temporal media speaks in episodes; converted views in their own element. */
export function selectionUnit(
  mediaType: string,
  conversion: ViewConversion | null = null,
): SelectionUnit {
  if (conversion) return CONVERTED_UNITS[conversion];
  if (mediaType === "multimodal") return EPISODE_UNIT;
  return mediaType === "video" ? VIDEO_UNIT : SAMPLE_UNIT;
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
  if (counts.groups) parts.push(count(counts.groups, "group"));
  // "Full" only earns its place next to segments; alone, "2 samples" is clear.
  if (counts.fullEpisodes)
    parts.push(
      unit.temporal && counts.segments
        ? count(counts.fullEpisodes, `full ${unit.one}`, `full ${unit.many}`)
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

/** Counts for a flat member list, as a frozen scope reports them. */
export function memberCounts(
  members: readonly SelectionMember[],
): SelectionCounts {
  const segments = members.filter((member) => member.kind === "segment");
  return {
    episodes: new Set(members.map((member) => member.episodeId)).size,
    fullEpisodes: members.length - segments.length,
    segments: segments.length,
    segmentEpisodes: new Set(segments.map((member) => member.episodeId)).size,
    unavailable: 0,
  };
}

const GROUP_BY_STAGE = "fiftyone.core.stages.GroupBy";

/** Whether the view groups samples dynamically, so a tile stands for a group. */
export function hasDynamicGroups(stages: readonly unknown[]) {
  let grouped = false;
  for (const stage of stages) {
    if (typeof stage !== "object" || stage === null) continue;
    const { _cls, kwargs } = stage as { _cls?: unknown; kwargs?: unknown };
    if (_cls === "fiftyone.core.stages.Flatten") grouped = false;
    if (_cls !== GROUP_BY_STAGE || !Array.isArray(kwargs)) continue;
    const flat = kwargs.find(
      (entry) => Array.isArray(entry) && entry[0] === "flat",
    ) as [string, unknown] | undefined;
    if (!flat?.[1]) grouped = true;
  }
  return grouped;
}

/* ---------------------------------------------------------------------------
 * Selection buckets
 * ------------------------------------------------------------------------- */

/** Up to this many working selections sit side by side in the tray. */
export const MAX_SELECTION_BUCKETS = 3;
/** Bucket names stay short enough to read as a pill. */
export const SELECTION_BUCKET_NAME_LENGTH = 10;
/**
 * The bucket every dataset starts with. Its captures keep the storage key
 * the single-bucket tray always used, so enabling buckets later loses nothing.
 */
export const PRIMARY_SELECTION_BUCKET = "primary";

/** The small icon palette a bucket can wear instead of its position number. */
export const SELECTION_BUCKET_ICONS = [
  "approve",
  "reject",
  "neutral",
  "question",
  "star",
  "flag",
  "bookmark",
  "idea",
] as const;
export type SelectionBucketIcon = (typeof SELECTION_BUCKET_ICONS)[number];

/** One working selection. Position in the list decides which gesture feeds it. */
export interface SelectionBucket {
  readonly id: string;
  /** Short display name, at most SELECTION_BUCKET_NAME_LENGTH characters. */
  readonly name?: string;
  readonly icon?: SelectionBucketIcon;
}

export const DEFAULT_SELECTION_BUCKETS: readonly SelectionBucket[] = [
  { id: PRIMARY_SELECTION_BUCKET },
];

/** Bucket ids never collide with the domain separators used in storage keys. */
const BUCKET_ID = /^[A-Za-z0-9_-]+$/;

/** Mint an id for a new bucket. */
export function newSelectionBucketId() {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `b${random}`;
}

/** Trim a proposed name to something that reads as a pill; empty means unnamed. */
export function normalizeSelectionBucketName(name: unknown) {
  if (typeof name !== "string") return undefined;
  const trimmed = name.trim().slice(0, SELECTION_BUCKET_NAME_LENGTH).trim();
  return trimmed || undefined;
}

/** Accept only well-formed, unique buckets from storage or callers; never zero. */
export function normalizeSelectionBuckets(
  value: unknown,
): readonly SelectionBucket[] {
  if (!Array.isArray(value)) return DEFAULT_SELECTION_BUCKETS;
  const seen = new Set<string>();
  const buckets: SelectionBucket[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, name, icon } = entry as Partial<SelectionBucket>;
    if (typeof id !== "string" || !BUCKET_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    const bucket: SelectionBucket = { id };
    const cleanName = normalizeSelectionBucketName(name);
    if (cleanName) Object.assign(bucket, { name: cleanName });
    if (
      typeof icon === "string" &&
      (SELECTION_BUCKET_ICONS as readonly string[]).includes(icon)
    )
      Object.assign(bucket, { icon: icon as SelectionBucketIcon });
    buckets.push(bucket);
    if (buckets.length === MAX_SELECTION_BUCKETS) break;
  }
  return buckets.length ? buckets : DEFAULT_SELECTION_BUCKETS;
}

/** Whether a bucket list is the untouched default the single tray implies. */
export function isDefaultSelectionBuckets(buckets: readonly SelectionBucket[]) {
  return (
    buckets.length === 1 &&
    buckets[0].id === PRIMARY_SELECTION_BUCKET &&
    !buckets[0].name &&
    !buckets[0].icon
  );
}

/**
 * The key a bucket's captures live under. The primary bucket keeps the bare
 * domain so its captures are the ones the single-bucket tray persisted.
 */
export function selectionCaptureKey(domainId: string, bucketId: string) {
  return bucketId === PRIMARY_SELECTION_BUCKET
    ? domainId
    : `${domainId}#${bucketId}`;
}

/** The dataset a selection domain (dataset, or dataset|conversion) belongs to. */
export function selectionDomainDataset(domainId: string) {
  return domainId.split("|")[0];
}

/** "Bucket 2" when a bucket has no name of its own. */
export function selectionBucketTitle(bucket: SelectionBucket, index: number) {
  return bucket.name ?? `Bucket ${index + 1}`;
}

/** The gesture that feeds a bucket, by its position. */
export type SelectionGesture = "click" | "command" | "option";

export function selectionBucketGesture(index: number): SelectionGesture {
  return index === 0 ? "click" : index === 1 ? "command" : "option";
}

/** The modifier flags a pointer event carries. */
export interface SelectionModifiers {
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
}

/**
 * The bucket a click feeds. Option/Alt reaches the third bucket, the command
 * modifier (⌘ on macOS, Ctrl elsewhere; both are honored everywhere) the
 * second, and anything else the first. A modifier with no bucket behind it
 * is treated as a plain click, so a two-bucket setup never swallows Alt.
 */
export function routeSelectionBucket(
  modifiers: SelectionModifiers,
  buckets: readonly SelectionBucket[],
): SelectionBucket {
  if (modifiers.altKey && buckets.length > 2) return buckets[2];
  if ((modifiers.metaKey || modifiers.ctrlKey) && buckets.length > 1)
    return buckets[1];
  return buckets[0];
}

/** "12 samples · 3 segments": the short form a bucket pill carries. */
export function compactScopeLabel(
  counts: SelectionCounts,
  unit: SelectionUnit = EPISODE_UNIT,
): string {
  const parts = [];
  if (counts.groups) parts.push(count(counts.groups, "group"));
  if (counts.fullEpisodes)
    parts.push(count(counts.fullEpisodes, unit.one, unit.many));
  if (counts.segments) parts.push(count(counts.segments, "segment"));
  return parts.join(" · ") || `0 ${unit.many}`;
}
