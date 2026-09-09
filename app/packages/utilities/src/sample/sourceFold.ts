import { applyDeltas } from "./apply";
import { JSONDeltas } from "../types";

/**
 * Server-faithful rebase of `sourceData` after a successful persist: apply
 * the SAME deltas the server just accepted, via the shared
 * {@link applyDeltas} primitive — the exact contract
 * `frameStore.rebaseFrame` uses for the frame side. The sample source gets
 * no post-save echo (a view refetch only happens on navigation), so
 * without this a DELETE re-diffs against the stale source forever:
 * `buildJsonPatch` re-emits the same `remove` on every autosave tick, the
 * client re-PATCHes an already-deleted field indefinitely, and the save
 * state never settles.
 *
 * Deviations from a bare `applyDeltas` call, both server-matching:
 *
 * - an `add` whose intermediate containers are absent from the local
 *   source (a nested primitive under an unset embedded field) creates the
 *   missing object parents, as the server does;
 * - an op the local source cannot satisfy at all is skipped rather than
 *   aborting the rebase — the ops were server-accepted, so a local
 *   mismatch means the local source was already stale there, and the next
 *   diff re-persists whatever still differs (fail-safe).
 */
export const rebaseSource = (
  sourceData: Readonly<Record<string, unknown>>,
  deltas: JSONDeltas,
): Record<string, unknown> => {
  // Batch first: applyDeltas deep-clones the document per call, so the
  // happy path pays exactly one clone. The per-op walk below is the
  // recovery path for the parent-creation / stale-op cases only.
  try {
    return applyDeltas(sourceData as Record<string, unknown>, deltas);
  } catch {
    // fall through to the per-op recovery
  }

  let next = sourceData as Record<string, unknown>;
  for (const op of deltas) {
    try {
      next = applyDeltas(next, [op]);
    } catch {
      if (op.op === "add" || op.op === "replace") {
        const created = withCreatedParents(next, op.path);
        if (created) {
          try {
            next = applyDeltas(created, [op]);
            continue;
          } catch {
            // fall through to the skip below
          }
        }
      }
      // remove of an already-absent path (or an unsatisfiable op): skip —
      // idempotent for removes, fail-safe for everything else.
    }
  }
  return next;
};

/**
 * Clone `doc` with plain-object containers created for every missing
 * intermediate segment of `pointer` (the leaf itself is left for the op to
 * write). Returns `null` when a missing intermediate is a list index —
 * fabricating array structure is not server-matching.
 */
const withCreatedParents = (
  doc: Record<string, unknown>,
  pointer: string,
): Record<string, unknown> | null => {
  const all = pointer.split("/").filter(Boolean);
  const segments = all.slice(0, -1);
  const leaf = all[all.length - 1];
  const isIndexSegment = (s: string | undefined) =>
    s === "-" || (s !== undefined && /^\d+$/.test(s));
  const root = { ...doc };
  let node: Record<string, unknown> = root;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    // What follows this container decides its shape: an append ("-") or
    // numeric index means the container must be an ARRAY — a {} here
    // would make fast-json-patch assign "-" as an object key.
    const following = i + 1 < segments.length ? segments[i + 1] : leaf;
    const value = node[segment];
    if (value === undefined || value === null) {
      if (isIndexSegment(segment)) {
        // fabricating array structure at a specific index is not
        // server-matching — bail and let the op be skipped
        return null;
      }
      const created: Record<string, unknown> | unknown[] = isIndexSegment(
        following,
      )
        ? []
        : {};
      node[segment] = created;
      node = created as Record<string, unknown>;
    } else if (typeof value === "object") {
      if (isIndexSegment(following) && !Array.isArray(value)) {
        // an existing non-array where the op needs an array: unsatisfiable
        return null;
      }
      const clone: Record<string, unknown> = Array.isArray(value)
        ? ([...value] as unknown as Record<string, unknown>)
        : { ...(value as Record<string, unknown>) };
      node[segment] = clone;
      node = clone;
    } else {
      return null;
    }
  }
  return root;
};
