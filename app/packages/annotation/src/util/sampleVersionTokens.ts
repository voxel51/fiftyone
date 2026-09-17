/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { parseTimestamp } from "@fiftyone/core/src/client/util";
import type { Sample } from "@fiftyone/looker";
import { getSampleVersionToken } from "./getSampleVersionToken";

/**
 * A version the server has confirmed for a sample: the opaque `ETag` it
 * returned, plus the `last_modified_at` of the same response so it can be
 * ordered against the app's copy of the sample.
 */
type ConfirmedVersion = {
  token: string;
  modifiedAt: number;
};

/**
 * The newest server-confirmed version per sample id, recorded from every
 * write response: the `ETag` of a successful PATCH, or the current `ETag` a
 * 412 carries alongside the current sample.
 *
 * The app's copy of the sample only catches up with a write once the
 * refreshed sample has re-rendered. A persist that starts right after another
 * one settles (a queued delete, an autosave tick) would otherwise read the
 * pre-write token from its render closure and be rejected. Reading this
 * record immediately before a request does not depend on render timing.
 *
 * Keyed by sample `_id`; ObjectIds are unique across datasets, and the record
 * is local to this tab.
 */
const confirmed = new Map<string, ConfirmedVersion>();

/**
 * Record the version the server just returned for a sample.
 *
 * @param sample Sample data as returned by the server (a success body or a
 *   412 body)
 * @param versionToken The `ETag` of the same response; when absent the token
 *   is derived from the sample's `last_modified_at`
 */
export const recordSampleVersion = ({
  sample,
  versionToken,
}: {
  sample: Record<string, unknown> | null | undefined;
  versionToken?: string | null;
}): void => {
  const id = sample?._id;
  const date = parseTimestamp(
    sample?.last_modified_at as Sample["last_modified_at"],
  );

  if (typeof id !== "string" || !date || Number.isNaN(date.getTime())) {
    return;
  }

  const token =
    versionToken ??
    getSampleVersionToken({ sample: sample as unknown as Sample });

  if (!token) {
    return;
  }

  const modifiedAt = date.getTime();
  const prior = confirmed.get(id);

  // never move a sample's record backwards
  if (!prior || modifiedAt > prior.modifiedAt) {
    confirmed.set(id, { token, modifiedAt });
  }
};

/**
 * The version token to send for `sample`.
 *
 * The server-confirmed record wins whenever it is at least as new as the
 * app's copy of the sample; that is the exact `ETag` the server issued. The
 * app's copy wins only when it is newer, i.e. it was loaded after a write
 * this tab never saw the response to (another user, a script), in which case
 * the token is derived from its `last_modified_at`.
 */
export const resolveSampleVersionToken = ({
  sample,
}: {
  sample: Sample | null;
}): string | null => {
  const recorded = sample?._id ? confirmed.get(sample._id) : undefined;
  const own = sample?.last_modified_at
    ? parseTimestamp(sample.last_modified_at)
    : null;

  if (recorded && (!own || recorded.modifiedAt >= own.getTime())) {
    return recorded.token;
  }

  return getSampleVersionToken({ sample });
};

/** Test seam. */
export const clearSampleVersions = (): void => {
  confirmed.clear();
};
