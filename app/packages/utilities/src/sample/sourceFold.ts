import { JSONDeltas } from "../types";
import { withoutPath, withValueAtPath } from "./pointer";

/** Source-side fold of a persisted patch. See {@link foldPersistedIntoSource}. */
export interface SourceFoldResult {
  readonly sourceData: Record<string, unknown>;
  /** Top-level fields whose delete tombstone the fold satisfied. */
  readonly releasedTombstones: string[];
}

/**
 * After a successful persist, fold the persisted fields into `sourceData` —
 * the committed truth the server just accepted. The sample source gets no
 * post-save echo (a view refetch only happens on navigation), so without
 * this a DELETE re-diffs against the stale source forever: `buildJsonPatch`
 * re-emits the same `remove` on every autosave tick, the client re-PATCHes
 * an already-deleted field indefinitely, and the save state never settles.
 * (`frameStore.reconcilePersisted` has always folded into source for
 * exactly this reason; the sample side only released transients.)
 *
 * Folds at FIELD granularity from `patchBaseline` — the transient captured
 * when the persisted patch was BUILT — never from the live transient: a
 * field re-edited while the request was in flight must keep diffing so the
 * newer edit persists on the next pass. Per persisted field:
 *
 * - tombstoned and absent from the baseline: the persisted patch removed
 *   it — drop it from source and release the tombstone;
 * - present in the baseline: the persisted patch wrote that value — commit
 *   it to source (client-normalized form, like the frame fold; a later
 *   real fetch replaces it with the server encoding).
 *
 * A `null` baseline folds nothing (fail safe, mirroring the release pass).
 */
export const foldPersistedIntoSource = (
  sourceData: Readonly<Record<string, unknown>>,
  baselineDeletes: ReadonlySet<string> | null,
  patchBaseline: Readonly<Record<string, unknown>> | null,
  deltas: JSONDeltas,
): SourceFoldResult | null => {
  if (!patchBaseline || !baselineDeletes) {
    return null;
  }

  let next: Record<string, unknown> | null = null;
  const releasedTombstones: string[] = [];
  const foldedKeys = new Set<string>();

  for (const op of deltas) {
    const segments = op.path.split("/").filter(Boolean);
    if (!segments.length) {
      continue;
    }

    // Transient KEYS are dot-paths of varying depth: a whole field for
    // label edits ("ground_truth"), a nested path for primitive edits
    // ("classification.label"). A tombstone's remove op is emitted at
    // exactly its key's path, while structural list diffs go deeper than
    // their key — so walk the op path's prefixes DEEPEST-FIRST and fold
    // at the first key that matches a tombstone or a baseline entry.
    for (let depth = segments.length; depth >= 1; depth -= 1) {
      const keySegments = segments.slice(0, depth);
      const key = keySegments.join(".");
      if (foldedKeys.has(key)) {
        break;
      }

      const inBaseline = Object.prototype.hasOwnProperty.call(
        patchBaseline,
        key,
      );

      // Decide from the PERSIST-TIME tombstones, never the current set: a
      // re-add while the request was in flight clears the live tombstone,
      // but the server still applied the remove — the fold must commit it
      // to source so the re-add diffs as a fresh add instead of silently
      // matching the stale source value.
      if (baselineDeletes.has(key) && !inBaseline) {
        next = withoutPath(next ?? sourceData, keySegments) as Record<
          string,
          unknown
        >;
        releasedTombstones.push(key);
        foldedKeys.add(key);
        break;
      }
      if (inBaseline) {
        next = withValueAtPath(
          next ?? sourceData,
          keySegments,
          patchBaseline[key],
        ) as Record<string, unknown>;
        foldedKeys.add(key);
        break;
      }
    }
  }

  return next ? { sourceData: next, releasedTombstones } : null;
};
