import {
  createSeriesLabelTable,
  remapSeriesLabelCodes,
  type SeriesLabelTable,
} from "../../../utils/numeric-series-labels";

interface PackedSeries {
  readonly timesSec: Float64Array;
  readonly values: Float64Array;
}

/**
 * Text-series bookkeeping for one source epoch of the numeric-series bridge,
 * keyed by `numericSeriesKey`.
 */
export interface TextSeriesState {
  /**
   * Re-expresses one read's values in the series' stable label codes.
   * Numeric series pass through unchanged.
   */
  encode(
    key: string,
    field: PackedSeries & { readonly labels?: readonly string[] },
  ): Float64Array;

  /** Snapshot of a text series' labels, indexed by code. */
  labels(key: string): readonly string[] | undefined;

  /**
   * Tile-cache key for a series. A loosely typed field can read as numbers
   * before its first text value; text series cache apart, so those earlier
   * numeric tiles are refetched instead of being read as label codes.
   */
  tileKey(key: string): string;
}

/** Creates empty text-series bookkeeping for a new source epoch. */
export function createTextSeriesState(): TextSeriesState {
  // One append-only table per text series, so cached tiles from different
  // reads keep one code per label.
  const labelTables = new Map<string, SeriesLabelTable>();

  return {
    encode(key, field) {
      let table = labelTables.get(key);
      if (field.labels && !table) {
        table = createSeriesLabelTable();
        labelTables.set(key, table);
      }
      if (!table) return field.values;

      return remapSeriesLabelCodes(field.values, field.labels, table);
    },
    labels(key) {
      const labels = labelTables.get(key)?.labels;
      return labels ? [...labels] : undefined;
    },
    tileKey(key) {
      return labelTables.has(key) ? `${key}\0labels` : key;
    },
  };
}
