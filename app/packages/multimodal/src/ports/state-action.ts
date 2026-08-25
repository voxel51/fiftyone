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
  }[];
  readonly dtype: string;
  readonly featureName: string;
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
}
