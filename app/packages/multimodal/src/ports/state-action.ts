import type {
  RawRecordCursor,
  RawRecordIndexWindow,
  RawRecordIndexWindowRequest,
} from "../ir";

/**
 * Declared identity of one state/action feature vector. Dimension order and
 * names come verbatim from source metadata; consumers must not reorder them
 * or invent semantic names for unnamed dimensions.
 */
export interface StateActionFeatureSchema {
  readonly dimensions: readonly {
    readonly index: number;
    readonly name?: string;
    /** Numeric-series field path plotting this dimension, when served. */
    readonly numericFieldPath?: string;
  }[];
  readonly dtype: string;
  readonly featureName: string;
  /** Numeric-series stream serving this feature's dimensions, when any. */
  readonly numericStreamId?: string;
  readonly shape: readonly number[];
}

/** Session-known state/action shape facts; derivable without any value read. */
export interface StateActionSchema {
  readonly action?: StateActionFeatureSchema;
  readonly rowCount: number;
  readonly state?: StateActionFeatureSchema;
}

/**
 * One exact source row. Both feature vectors come from the same logical row,
 * identified by a cursor in the same opaque, source-epoch-scoped domain the
 * raw-record capability uses. Values are raw parsed source values — never
 * float-coerced, padded, or truncated; a shape disagreement is reported
 * through `featureErrors` while the readable values are preserved.
 */
export interface StateActionRow {
  readonly action?: readonly unknown[];
  readonly cursor: RawRecordCursor;
  /** Feature-scoped read faults; values are never silently padded to hide one. */
  readonly featureErrors?: {
    readonly action?: string;
    readonly state?: string;
  };
  readonly frameIndex: number;
  readonly state?: readonly unknown[];
  readonly task?: {
    readonly index: number;
    readonly label?: string;
  };
  readonly timestampNs: bigint;
}

/** Source-declared per-dimension statistics for one feature, row-major. */
export interface StateActionFeatureStats {
  readonly max?: readonly number[];
  readonly mean?: readonly number[];
  readonly min?: readonly number[];
  readonly q01?: readonly number[];
  readonly q50?: readonly number[];
  readonly q99?: readonly number[];
  readonly std?: readonly number[];
}

/** Source-declared dataset statistics for the canonical features. */
export interface StateActionStats {
  readonly action?: StateActionFeatureStats;
  /** Dataset-wide frame count the statistics were computed over. */
  readonly sampleCount?: number;
  readonly state?: StateActionFeatureStats;
}

/** One episode extreme: the exact row where a dimension attains a value. */
export interface StateActionDimensionExtreme {
  readonly frameIndex: number;
  readonly timestampNs: bigint;
  readonly value: number;
}

/**
 * Episode-computed per-dimension aggregates for one feature, row-major.
 * Only finite numeric values aggregate; a dimension with none is null.
 */
export interface StateActionFeatureProfile {
  readonly max: readonly (StateActionDimensionExtreme | null)[];
  readonly mean: readonly (number | null)[];
  readonly min: readonly (StateActionDimensionExtreme | null)[];
  /**
   * Rows whose value falls outside the source-declared [min, max]; null
   * for a dimension without declared bounds, or entirely when the source
   * declares no statistics.
   */
  readonly outOfRangeCounts: readonly (number | null)[] | null;
}

/** One irregular inter-row interval in the episode's recorded timeline. */
export interface StateActionTimingGap {
  /** Frame index of the last row before the gap. */
  readonly beforeFrameIndex: number;
  readonly durationNs: bigint;
  /** Timestamp of the first row after the gap — the natural seek target. */
  readonly timestampNs: bigint;
}

/**
 * Recorded-cadence facts for the episode. A gap is an inter-row interval
 * exceeding 1.5× the median interval, so a single dropped frame at a
 * steady rate registers while ordinary jitter does not.
 */
export interface StateActionTimingProfile {
  readonly gapCount: number;
  /** Largest-first sample of the gaps, capped for transport. */
  readonly gaps: readonly StateActionTimingGap[];
  /** Median inter-row interval; 0n with fewer than two rows. */
  readonly medianIntervalNs: bigint;
}

/**
 * Episode-computed profile over every row: per-dimension extremes and
 * means, recorded-timing health, and index-wise action-vs-state tracking
 * error. Everything here derives from this episode's rows — never from
 * dataset-declared statistics, which only bound the out-of-range counts.
 */
export interface StateActionEpisodeProfile {
  readonly action?: StateActionFeatureProfile;
  readonly rowCount: number;
  readonly state?: StateActionFeatureProfile;
  readonly timing: StateActionTimingProfile;
  /**
   * Mean |action − state| per dimension, present only when both features
   * declare the same dimension count; a null entry had no row where both
   * values were finite.
   */
  readonly trackingError?: readonly (number | null)[];
}

/**
 * Optional semantic capability for exact single-row state/action inspection.
 *
 * `schema` is a plain property because it derives from already-loaded episode
 * metadata; no I/O and no promise. Time reads use latest-row-at-or-before
 * semantics inside the episode's declared time range and return `null` before
 * the first row or outside the range. Cursor reads never consult the playback
 * clock; an unknown or stale cursor is a typed error, never a silent
 * nearest-row substitution.
 */
export interface StateActionCapability {
  /** Derived from already-loaded episode metadata; no I/O, no promise. */
  readonly schema: StateActionSchema;
  readAtTime(request: {
    /** Paused inspection stays responsive; playback following stays idle. */
    readonly intent?: "background" | "paused-inspection";
    readonly signal?: AbortSignal;
    readonly timestampNs: bigint;
  }): Promise<StateActionRow | null>;
  /** Reads one exact row without consulting the playback clock. */
  readAtCursor(request: {
    readonly cursor: RawRecordCursor;
    readonly signal?: AbortSignal;
  }): Promise<StateActionRow>;
  /** Bounded index-only window; the anchor union is exclusive by contract. */
  readIndexWindow(
    request: RawRecordIndexWindowRequest & {
      readonly signal?: AbortSignal;
    },
  ): Promise<RawRecordIndexWindow>;
  /**
   * Source-declared per-dimension statistics, read lazily and cached for
   * the session. Resolves null when the source ships none; a missing or
   * unreadable statistics asset never blocks row inspection.
   */
  readDimensionStats?(options?: {
    readonly signal?: AbortSignal;
  }): Promise<StateActionStats | null>;
  /**
   * Episode-computed profile over every row, read lazily and cached for
   * the session. The scan shares the row-read caches, so profiling never
   * rereads data a row inspection already paid for.
   */
  readEpisodeProfile?(options?: {
    readonly signal?: AbortSignal;
  }): Promise<StateActionEpisodeProfile>;
}
