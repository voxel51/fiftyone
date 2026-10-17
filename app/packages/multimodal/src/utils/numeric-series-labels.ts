/**
 * Text-valued plot fields (driving modes, road conditions, CAN value-table
 * states) travel through the numeric-series pipeline as category codes: each
 * finite value is an index into a label table, and NaN still marks a gap.
 * Tables are append-only, so a code keeps its meaning for the table's life.
 */

/** Distinct labels one table holds before new text shares the overflow label. */
export const MAX_SERIES_LABELS = 256;

/** Text longer than this is truncated before it becomes a label. */
export const MAX_SERIES_LABEL_LENGTH = 200;

/** Shared category for text beyond `MAX_SERIES_LABELS` distinct values. */
export const SERIES_OVERFLOW_LABEL = "(other values)";

/** Append-only mapping between text values and stable category codes. */
export interface SeriesLabelTable {
  /** Labels indexed by code. Grows in place; copy before publishing. */
  readonly labels: readonly string[];

  /** Returns the code for `text`, assigning the next code when it is new. */
  code(text: string): number;
}

/**
 * Creates an empty label table. A free-text field cannot grow it without
 * bound: past `MAX_SERIES_LABELS` distinct values every new text shares one
 * overflow code.
 */
export function createSeriesLabelTable(): SeriesLabelTable {
  const labels: string[] = [];
  const codes = new Map<string, number>();
  const assign = (label: string) => {
    codes.set(label, labels.length);
    labels.push(label);
    return labels.length - 1;
  };
  return {
    labels,
    code(text) {
      const label =
        text.length > MAX_SERIES_LABEL_LENGTH
          ? `${text.slice(0, MAX_SERIES_LABEL_LENGTH)}…`
          : text;
      const existing = codes.get(label);
      if (existing !== undefined) return existing;
      if (labels.length < MAX_SERIES_LABELS) return assign(label);
      // Past capacity, every new label shares the overflow code. Keying it by
      // its text also merges an overflow label remapped from another table.
      return codes.get(SERIES_OVERFLOW_LABEL) ?? assign(SERIES_OVERFLOW_LABEL);
    },
  };
}

/**
 * Re-expresses one read's values as codes in `table`, so results from
 * independent reads share one stable encoding. With `labels`, values are
 * codes into that read-local table; without, the read saw only numbers for a
 * field already known to hold text, and each number is coded as its text.
 * NaN gap markers pass through.
 */
export function remapSeriesLabelCodes(
  values: Float64Array,
  labels: readonly string[] | undefined,
  table: SeriesLabelTable,
): Float64Array {
  const codes = labels?.map((label) => table.code(label));
  return values.map((value) => {
    if (Number.isNaN(value)) return value;
    return codes ? (codes[value] ?? Number.NaN) : table.code(String(value));
  });
}
