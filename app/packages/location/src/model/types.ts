/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * The location, as the URL states it: an opaque route the host defines, and
 * the query, which is params all the way down.
 *
 * Nothing here names a dataset, a sample or a section. The package owns the
 * mechanism — one reader, one writer, one registry — and the host owns what
 * its URLs mean.
 */
export interface LocationModel<R> {
  readonly route: R;
  readonly params: Readonly<Record<string, string>>;
}

export type HistoryPolicy = "push" | "replace";
