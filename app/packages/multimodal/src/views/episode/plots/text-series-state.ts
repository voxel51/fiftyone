import type { NumericStreamFields } from "../../../ir";
import { numericSeriesKey } from "../../../runtime";
import {
  createSeriesLabelTable,
  remapSeriesLabelCodes,
  type SeriesLabelTable,
} from "../../../utils/numeric-series-labels";
import { nsDeltaToSeconds } from "../../../utils/nanoseconds";

/** Held-state priors kept per text series for recently read windows. */
const MAX_PRIORS_PER_SERIES = 16;

interface HeldStatePrior {
  /** Window start this prior was resolved for. */
  readonly atNs: bigint;
  readonly timeSec: number;
  readonly value: number;
}

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
   * Re-expresses one read's values in the series' stable label codes, and
   * keeps the sample that precedes `priorAtNs` as a held-state prior.
   * Numeric series pass through unchanged.
   */
  encode(
    key: string,
    field: PackedSeries & { readonly labels?: readonly string[] },
    baseTimeNs: bigint,
    priorAtNs?: bigint,
  ): Float64Array;

  /** Whether reads should ask for priors: the series holds text. */
  isText(key: string): boolean;

  /** Snapshot of a text series' labels, indexed by code. */
  labels(key: string): readonly string[] | undefined;

  /** Notes the catalog's text fields, so their first reads ask for priors. */
  noteCatalog(streams: readonly NumericStreamFields[]): void;

  /**
   * Tile-cache key for a series. A loosely typed field can read as numbers
   * before its first text value; text series cache apart, so those earlier
   * numeric tiles are refetched instead of being read as label codes.
   */
  tileKey(key: string): string;

  /**
   * Prepends the state held entering a horizon when the series' visible
   * samples start later, as on-change states usually do.
   */
  withPrior(
    key: string,
    series: PackedSeries,
    horizonStartNs: bigint,
    horizonStartSec: number,
  ): PackedSeries;
}

/** Creates empty text-series bookkeeping for a new source epoch. */
export function createTextSeriesState(): TextSeriesState {
  // One append-only table per text series, so cached tiles from different
  // reads keep one code per label.
  const labelTables = new Map<string, SeriesLabelTable>();
  const catalogTextKeys = new Set<string>();
  // Tiles only hold samples inside their range, so the newest sample before
  // each read window lives here.
  const priorsByKey = new Map<string, HeldStatePrior[]>();

  return {
    encode(key, field, baseTimeNs, priorAtNs) {
      let table = labelTables.get(key);
      if (field.labels && !table) {
        table = createSeriesLabelTable();
        labelTables.set(key, table);
      }
      if (!table) return field.values;

      const values = remapSeriesLabelCodes(field.values, field.labels, table);
      if (
        priorAtNs !== undefined &&
        field.timesSec.length > 0 &&
        field.timesSec[0] < nsDeltaToSeconds(priorAtNs - baseTimeNs)
      ) {
        const priors = priorsByKey.get(key) ?? [];
        priors.push({
          atNs: priorAtNs,
          timeSec: field.timesSec[0],
          value: values[0],
        });
        priorsByKey.set(key, priors.slice(-MAX_PRIORS_PER_SERIES));
      }
      return values;
    },
    isText(key) {
      return labelTables.has(key) || catalogTextKeys.has(key);
    },
    labels(key) {
      const labels = labelTables.get(key)?.labels;
      return labels ? [...labels] : undefined;
    },
    noteCatalog(streams) {
      for (const stream of streams) {
        for (const field of stream.fields) {
          if (field.valueType === "string") {
            catalogTextKeys.add(numericSeriesKey(stream.streamId, field.path));
          }
        }
      }
    },
    tileKey(key) {
      return labelTables.has(key) ? `${key}\0labels` : key;
    },
    withPrior(key, series, horizonStartNs, horizonStartSec) {
      const priors = priorsByKey.get(key);
      if (
        !priors ||
        (series.timesSec.length > 0 && series.timesSec[0] <= horizonStartSec)
      ) {
        return series;
      }
      // A prior resolved for `atNs` is the newest sample before it, so it is
      // also the held state at any horizon start between itself and `atNs`.
      let prior: HeldStatePrior | undefined;
      for (let index = priors.length - 1; index >= 0 && !prior; index -= 1) {
        const candidate = priors[index];
        if (
          candidate.atNs >= horizonStartNs &&
          candidate.timeSec <= horizonStartSec
        ) {
          prior = candidate;
        }
      }
      if (!prior) return series;

      const timesSec = new Float64Array(series.timesSec.length + 1);
      const values = new Float64Array(series.values.length + 1);
      timesSec[0] = prior.timeSec;
      values[0] = prior.value;
      timesSec.set(series.timesSec, 1);
      values.set(series.values, 1);
      return { timesSec, values };
    },
  };
}
