/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Categorical sample fields that Lanes and Matrix can split by, their value
 * counts, and the Match stage that selects one value.
 */

import { selector, useReverbValue } from "@fiftyone/reverb";
import * as fos from "@fiftyone/state";
import {
  BOOLEAN_FIELD,
  CLASSIFICATION_FIELD,
  LIST_FIELD,
  STRING_FIELD,
} from "@fiftyone/utilities";
import { useCallback, useMemo } from "react";

const EXCLUDED = new Set(["filepath"]);

/** String, boolean, and list-of-string fields plus Classification labels. */
export const categoricalPaths = selector<string[]>({
  key: "floodlight.categoricalPaths",
  get: ({ get }) => {
    const schema = get(fos.fieldSchema({ space: fos.State.SPACE.SAMPLE }));
    const media = new Set(get(fos.mediaFields) ?? []);
    const paths: string[] = [];
    for (const [name, field] of Object.entries(schema)) {
      if (name.startsWith("_") || EXCLUDED.has(name) || media.has(name)) {
        continue;
      }
      const { ftype, subfield, embeddedDocType } = field;
      if (
        ftype === STRING_FIELD ||
        ftype === BOOLEAN_FIELD ||
        (ftype === LIST_FIELD && subfield === STRING_FIELD)
      ) {
        paths.push(name);
      } else if (embeddedDocType === CLASSIFICATION_FIELD) {
        paths.push(`${name}.label`);
      }
    }
    return paths.sort();
  },
});

/** Database path and list-ness per categorical path, for Match stages. */
const matchPaths = selector<Record<string, { db: string; list: boolean }>>({
  key: "floodlight.matchPaths",
  get: ({ get }) =>
    Object.fromEntries(
      get(categoricalPaths).map((path) => [
        path,
        {
          db: get(fos.dbPath(path)),
          list: get(fos.field(path))?.ftype === LIST_FIELD,
        },
      ]),
    ),
});

export type FieldValue = string | boolean | null;

export interface ValueCount {
  count: number;
  label: string;
  value: FieldValue;
}

const labelOf = (value: FieldValue) =>
  value === null ? "None" : String(value);

export type CountValuesData = {
  values: readonly { value: number; str?: string | null; bool?: boolean }[];
};

/** Sorts by count (lanes) or by value (matrix axes). */
export const toValueCounts = (
  data: CountValuesData,
  order: "count" | "value",
): ValueCount[] => {
  const values: ValueCount[] = data.values.map((entry) => {
    const value = (entry.str ?? entry.bool ?? null) as FieldValue;
    return { count: entry.value, label: labelOf(value), value };
  });
  return values.sort((a, b) =>
    order === "count"
      ? b.count - a.count || a.label.localeCompare(b.label)
      : a.label.localeCompare(b.label),
  );
};

/**
 * Value counts for `path` under the current view and filters. Suspends while
 * loading; see {@link toValueCounts} for `order`.
 */
export const useValueCounts = (path: string, order: "count" | "value") => {
  const data = useReverbValue(fos.countValues(path)) as CountValuesData;

  return useMemo(() => toValueCounts(data, order), [data, order]);
};

/** Builds a Match stage selecting samples whose `path` equals `value`. */
export const useMatchStage = () => {
  const paths = useReverbValue(matchPaths);

  return useCallback(
    (path: string, value: FieldValue) => {
      const ref = `$${paths[path]?.db ?? path}`;
      let expr: object;
      if (paths[path]?.list) {
        expr =
          value === null
            ? { $eq: [{ $size: { $ifNull: [ref, []] } }, 0] }
            : { $in: [value, { $ifNull: [ref, []] }] };
      } else {
        // $ifNull so a missing field (or missing parent document) equals null
        expr = { $eq: [{ $ifNull: [ref, null] }, value] };
      }

      return {
        _cls: fos.MATCH_VIEW_STAGE,
        kwargs: [["filter", { $expr: expr }]],
      };
    },
    [paths],
  );
};
