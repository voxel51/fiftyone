/**
 * Canonical annotation-entity identity.
 *
 * Identity is the full tuple `(sample, instanceId, frame?)`. `instanceId`
 * alone is a LINKAGE key — `fo.Instance` spans group slices, so it is not
 * unique across samples. Linkage-class aggregation (cross-slice highlight)
 * is a separate, derived query; store ops never key on `instanceId` alone.
 */

/**
 * Canonical address of an annotation entity. The lingua franca: store keys,
 * change events, selection sets, and signal topics all key on this.
 */
export interface LabelRef {
  /** Owning sample `_id` — part of identity (`instanceId` spans samples). */
  sample: string;

  /** Schema field path, frame-agnostic (`"frames.detections"`). */
  path: string;

  /** Client-minted ObjectId, stable from birth; a linkage key across samples. */
  instanceId: string;

  /** Occurrence coordinate; `undefined` = sample-level (never coerced to 0). */
  frame?: number;
}

/** A ref within an ambient sample scope (`engine.scope(sample)`). */
export type ScopedRef = Omit<LabelRef, "sample">;

/**
 * Stamp a frame-locked surface's occurrence coordinate onto a ref. The scene
 * holds one frame-agnostic handle per track, but engine writes/selection
 * address `(instanceId, frame)`. `frameOf` returns the playhead's frame for a
 * per-frame path, or `undefined` for a sample-level one (a temporal detection
 * sharing the video scene) which must stay frame-less. Image/3D pass no
 * `frameOf`, so refs stay frame-agnostic.
 */
export const stampFrame = <R extends { path: string }>(
  ref: R,
  frameOf?: (path: string) => number | undefined
): R & { frame?: number } => {
  const frame = frameOf?.(ref.path);

  return frame != null ? { ...ref, frame } : ref;
};

/** Bind a scoped ref to its sample, producing a canonical ref. */
export const toLabelRef = (sample: string, ref: ScopedRef): LabelRef => ({
  sample,
  path: ref.path,
  instanceId: ref.instanceId,
  frame: ref.frame,
});

/** Full-tuple identity equality. */
export const refsEqual = (a: LabelRef, b: LabelRef): boolean =>
  a.sample === b.sample &&
  a.path === b.path &&
  a.instanceId === b.instanceId &&
  a.frame === b.frame;

/**
 * Deterministic map key over full identity, for engine-internal collections.
 * NOT the wire format — cross-process/string-boundary uses `EntityId`.
 */
export const refKey = (ref: LabelRef): string =>
  [ref.sample, ref.path, ref.instanceId, ref.frame ?? ""].join(" ");

/** Frame-agnostic track key; hover is track-level (all occurrences light up). */
export const hoverKey = (ref: LabelRef): string =>
  [ref.sample, ref.path, ref.instanceId].join(" ");

/** Linkage-class key (`instanceId` alone) — cross-slice highlight ONLY. */
export const linkageKey = (ref: LabelRef): string => ref.instanceId;
