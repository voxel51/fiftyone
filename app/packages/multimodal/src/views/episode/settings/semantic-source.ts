import type { SceneSource } from "../../../ir";

/** Stable, recording-independent identity for one visualization source. */
export type SemanticSourceKey = string;

const MAX_SOURCE_PART_LENGTH = 512;

/**
 * Builds a collision-safe source identity. JSON tuple encoding avoids the
 * delimiter collisions that are possible with ad-hoc concatenation.
 */
export function semanticSourceKey(
  source: Pick<SceneSource, "sourceName" | "type">,
): SemanticSourceKey {
  return JSON.stringify([source.type, source.sourceName]) as SemanticSourceKey;
}

/** Returns a validated semantic source identity from persisted input. */
export function normalizeSemanticSourceKey(
  value: unknown,
): SemanticSourceKey | null {
  if (typeof value !== "string" || value.length > 1_100) return null;
  try {
    const tuple: unknown = JSON.parse(value);
    if (
      !Array.isArray(tuple) ||
      tuple.length !== 2 ||
      !tuple.every(
        (part) =>
          typeof part === "string" &&
          part.length > 0 &&
          part.length <= MAX_SOURCE_PART_LENGTH,
      )
    ) {
      return null;
    }
    return JSON.stringify(tuple) as SemanticSourceKey;
  } catch {
    return null;
  }
}

/** Runtime lookup used only at the inventory/rendering boundary. */
export interface SemanticSourceIndex {
  readonly keyByRuntimeId: ReadonlyMap<string, SemanticSourceKey>;
  readonly runtimeIdsByKey: ReadonlyMap<SemanticSourceKey, readonly string[]>;
  readonly representativeByKey: ReadonlyMap<SemanticSourceKey, SceneSource>;
}

/** Groups duplicate runtime channels that describe the same semantic source. */
export function createSemanticSourceIndex(
  sources: readonly SceneSource[],
): SemanticSourceIndex {
  const keyByRuntimeId = new Map<string, SemanticSourceKey>();
  const mutableIdsByKey = new Map<SemanticSourceKey, string[]>();
  const representativeByKey = new Map<SemanticSourceKey, SceneSource>();
  for (const source of sources) {
    const key = semanticSourceKey(source);
    keyByRuntimeId.set(source.id, key);
    const ids = mutableIdsByKey.get(key) ?? [];
    if (!ids.includes(source.id)) ids.push(source.id);
    mutableIdsByKey.set(key, ids);
    if (!representativeByKey.has(key)) representativeByKey.set(key, source);
  }
  return {
    keyByRuntimeId,
    representativeByKey,
    runtimeIdsByKey: mutableIdsByKey,
  };
}

/** Deduplicates sources for settings UI while retaining inventory order. */
export function groupSourcesBySemanticIdentity(
  sources: readonly SceneSource[],
): readonly SceneSource[] {
  return [...createSemanticSourceIndex(sources).representativeByKey.values()];
}

/** Maps semantic preferences to every matching runtime channel. */
export function resolveSemanticSourceKeys(
  keys: readonly SemanticSourceKey[],
  index: SemanticSourceIndex,
): readonly string[] {
  const ids = new Set<string>();
  for (const key of keys) {
    for (const id of index.runtimeIdsByKey.get(key) ?? []) ids.add(id);
  }
  return [...ids];
}

/** Maps runtime channel ids to unique stable identities. */
export function semanticSourceKeysForRuntimeIds(
  ids: readonly string[],
  index: SemanticSourceIndex,
): readonly SemanticSourceKey[] {
  const keys = new Set<SemanticSourceKey>();
  for (const id of ids) {
    const key = index.keyByRuntimeId.get(id);
    if (key) keys.add(key);
  }
  return [...keys];
}
