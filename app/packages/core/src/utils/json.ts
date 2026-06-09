import * as jsonpatch from "fast-json-patch";

/**
 * Normalize data for accurate comparison.
 *
 * @param data Data to normalize
 */
export const normalizeData = (data: unknown): unknown => {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;

    // convert dates from {_cls: "DateTime": datetime: 12345...} to iso strings
    if (obj._cls === "DateTime" && typeof obj.datetime === "number") {
      try {
        const date = new Date(obj.datetime);
        if (!Number.isNaN(date.getTime())) {
          return date.toISOString();
        }
      } catch (err) {
        console.warn("failed to parse date", err);
      }
    }

    // recursively normalize objects
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, normalizeData(v)])
    );
  }

  // recursively normalize lists
  if (Array.isArray(data)) {
    return data.map(normalizeData);
  }

  return data;
};

/**
 * Create an array of patches from the differences between two objects.
 *
 * @param from From object
 * @param to To object
 */
export const generateJsonPatch = <
  T extends Record<string, unknown> | unknown[]
>(
  from: T,
  to: T
): jsonpatch.Operation[] => {
  return jsonpatch.compare(normalizeData(from), normalizeData(to));
};

/**
 * Injected specifics for {@link idAlignedDetectionsDelta}. The orchestration
 * (id-alignment, append-adds, descending-removes) is shared; how an item
 * carries an id, how a matched item is diffed, how an added item serializes,
 * and where removals come from differ per label shape and are supplied here.
 */
export interface IdAlignedDeltaSpec<TCurrent, TBaseline> {
  /** Stable id of a current (edited) item; items returning undefined are skipped. */
  currentId: (item: TCurrent) => string | undefined;
  /** Stable id of a baseline (server) entry. */
  baselineId: (entry: TBaseline) => string | undefined;
  /** Diff a matched item against its baseline entry; ops must be rooted at `path`. */
  diffMatched: (
    current: TCurrent,
    baseline: TBaseline,
    path: string
  ) => jsonpatch.Operation[];
  /** Serialize an unmatched item into an `add` value; return null to skip it. */
  serializeAdd: (current: TCurrent) => unknown;
  /**
   * Ids to remove. Omit to remove baseline ids absent from `current`
   * (set-diff); supply explicitly when absence doesn't imply deletion (e.g.
   * a tombstone list).
   */
  removalIds?: Iterable<string>;
}

/**
 * Build a JSON-Patch delta for one detections array, aligning the edited
 * `current` items to the server `baseline` by id rather than by array
 * position. Shared shape behind the per-frame video-label diff and the
 * temporal-detection diff.
 *
 * Emits, under `<containerPath>/detections/...`: an `add` (`/-`) for current
 * items with no baseline match, `diffMatched` ops for items on both sides (at
 * their baseline index), and `remove`s for removed ids in DESCENDING index
 * order so an earlier remove never shifts an index a later one references.
 *
 * Index-aligned diffing floods unappliable replaces when a list shifts (a
 * deleted slot slides every later slot down); id-alignment is what avoids that
 * and stays safe against baseline entries the client never saw.
 */
export const idAlignedDetectionsDelta = <TCurrent, TBaseline>(
  current: readonly TCurrent[],
  baseline: readonly TBaseline[],
  containerPath: string,
  spec: IdAlignedDeltaSpec<TCurrent, TBaseline>
): jsonpatch.Operation[] => {
  const { currentId, baselineId, diffMatched, serializeAdd, removalIds } = spec;

  const baselineIndexById = new Map<string, number>();
  baseline.forEach((entry, index) => {
    const id = baselineId(entry);
    if (id !== undefined) {
      baselineIndexById.set(id, index);
    }
  });

  const ops: jsonpatch.Operation[] = [];
  const currentIds = new Set<string>();

  // Adds + in-place updates, in current order.
  for (const item of current) {
    const id = currentId(item);
    if (id === undefined) {
      continue;
    }

    currentIds.add(id);
    const index = baselineIndexById.get(id);

    if (index === undefined) {
      const value = serializeAdd(item);
      if (value === null || value === undefined) {
        continue;
      }

      ops.push({ op: "add", path: `${containerPath}/detections/-`, value });
      continue;
    }

    for (const op of diffMatched(
      item,
      baseline[index],
      `${containerPath}/detections/${index}`
    )) {
      ops.push(op);
    }
  }

  // Removals resolved to baseline index, descending so indices stay valid.
  const removalIndices: number[] = [];
  if (removalIds !== undefined) {
    for (const id of removalIds) {
      const index = baselineIndexById.get(id);
      if (index !== undefined) {
        removalIndices.push(index);
      }
    }
  } else {
    baselineIndexById.forEach((index, id) => {
      if (!currentIds.has(id)) {
        removalIndices.push(index);
      }
    });
  }

  removalIndices.sort((a, b) => b - a);
  for (const index of removalIndices) {
    ops.push({ op: "remove", path: `${containerPath}/detections/${index}` });
  }

  return ops;
};

/**
 * Extract a dot-delimited field from a nested object.
 *
 * @param data Data record
 * @param path Dot-delimited path to nested field
 */
export const extractNestedField = <T>(
  data: Record<string, unknown>,
  path: string
): T | undefined => {
  const parts = path.split(".");

  let current = data;

  for (const part of parts) {
    if (typeof current === "object" && current[part]) {
      current = current[part];
    } else {
      // missing field
      return;
    }
  }

  // current now points to the last path segment (our value of interest)
  return current as T;
};
