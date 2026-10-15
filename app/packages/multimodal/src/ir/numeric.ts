import type { StreamId } from "./manifest";

/**
 * One scalar leaf addressable by a plot or inspector. A "string" value type
 * plots as discrete states; every other type plots as a numeric line.
 */
export interface NumericFieldDescriptor {
  readonly path: string;
  readonly valueType: string;
}

/** Why a stream cannot currently expose plottable numeric fields. */
export type NumericFieldAvailability =
  | "no-numeric-fields"
  | "ready"
  | "schema-unavailable"
  | "unsupported-encoding";

/** Cloneable numeric-field inventory for one episode stream. */
export interface NumericStreamFields {
  readonly availability: NumericFieldAvailability;
  readonly encoding: string;
  readonly fields: readonly NumericFieldDescriptor[];
  /** Dynamic discovery used a bounded, potentially partial data fallback. */
  readonly sampled?: boolean;
  readonly sourceName: string;
  readonly streamId: StreamId;
}

/** Packed recording-relative values for one requested numeric field. */
export interface NumericSeriesField {
  /** Exact absolute bucket identity for aligned bounded-read summaries. */
  readonly bucketIndexes?: BigInt64Array;
  /** Per-decimation-bucket discontinuity bits, when supplied by the adapter. */
  readonly bucketGapMask?: Uint8Array;

  /**
   * Present when the field holds text: each finite value is an index into
   * these labels, local to this result. NaN still marks a gap.
   */
  readonly labels?: readonly string[];
  readonly path: string;
  readonly timesSec: Float64Array;
  readonly values: Float64Array;
}

/** Cloneable packed numeric-series result for one episode stream. */
export interface NumericSeriesResult {
  readonly baseTimeNs: bigint;
  readonly fields: readonly NumericSeriesField[];
  readonly sampleCount: number;
  readonly streamId: StreamId;
  readonly truncated: boolean;
}
