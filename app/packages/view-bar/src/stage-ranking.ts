/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Ordering for the insert dropdown: stages used most recently in this
 * browser first, then the stages people reach for most, then everything
 * else in the server's alphabetical order.
 */

const RECENT_KEY = "fo-view-bar-recent-stages";
const RECENT_LIMIT = 5;

/** The stages people reach for most, in the order the list offers them. */
const COMMON_STAGES = [
  "Match",
  "FilterLabels",
  "Limit",
  "SortBy",
  "FilterField",
  "MatchTags",
  "Exists",
  "Shuffle",
  "Take",
  "Skip",
  "SelectFields",
  "ExcludeFields",
  "SortBySimilarity",
  "ToPatches",
  "GroupBy",
];

export const readRecentStages = (): string[] => {
  // Storage can be unavailable or hold garbage (private windows, cleared
  // site data); ranking then simply loses recency
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(RECENT_KEY) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed.filter((name): name is string => typeof name === "string")
      : [];
  } catch {
    return [];
  }
};

/** Moves a just-inserted stage to the front and returns the new list. */
export const recordRecentStage = (name: string): string[] => {
  const next = [
    name,
    ...readRecentStages().filter((existing) => existing !== name),
  ].slice(0, RECENT_LIMIT);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // See readRecentStages
  }
  return next;
};

/**
 * Ranks insertable stages: recent (in recency order), then common (in
 * {@link COMMON_STAGES} order), then the rest in the order given — the
 * stable sort preserves the server's alphabetical tail.
 */
export const rankStages = (
  names: readonly string[],
  recent: readonly string[],
): string[] => {
  const recentRank = new Map(recent.map((name, i) => [name, i]));
  const commonRank = new Map(COMMON_STAGES.map((name, i) => [name, i]));
  const rank = (map: Map<string, number>, name: string) =>
    map.get(name) ?? Number.POSITIVE_INFINITY;
  return [...names].sort(
    (a, b) =>
      rank(recentRank, a) - rank(recentRank, b) ||
      rank(commonRank, a) - rank(commonRank, b),
  );
};
