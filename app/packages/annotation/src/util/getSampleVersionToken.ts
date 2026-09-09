import { parseTimestamp } from "@fiftyone/core/src/client/util";
import type { Sample } from "@fiftyone/looker";

/**
 * Freshest server-confirmed `last_modified_at` per sample id, recorded from
 * every write response. The modal sample a token is otherwise read from only
 * catches up after an async refetch, so a second write inside that window
 * would carry the pre-write token and fail the server's If-Match check.
 */
const confirmed = new Map<string, Date>();

const toToken = (date: Date): string => {
  const iso = date.toISOString();

  // server doesn't like the iso timestamp ending in 'Z'
  return iso.endsWith("Z") ? iso.substring(0, iso.length - 1) : iso;
};

/**
 * Record a sample's server-confirmed version from a write response.
 *
 * @param sample Sample data as returned by the server
 */
export const recordSampleVersionToken = (
  sample: Record<string, unknown> | null | undefined,
): void => {
  const id = sample?._id;
  const date = parseTimestamp(
    sample?.last_modified_at as Sample["last_modified_at"],
  );

  if (typeof id !== "string" || !date || Number.isNaN(date.getTime())) {
    return;
  }

  const prior = confirmed.get(id);

  if (!prior || date.getTime() > prior.getTime()) {
    confirmed.set(id, date);
  }
};

/**
 * Get a version token for a sample.
 *
 * A version token is a string which uniquely identifies a specific version of
 * a sample. The later of the sample's own `last_modified_at` and the version
 * last confirmed by the server for that sample id wins.
 *
 * If a version token cannot be determined, `null` is returned instead.
 *
 * @param sample Sample for which to obtain a version token
 */
export const getSampleVersionToken = ({
  sample,
}: {
  sample: Sample | null;
}): string | null => {
  if (!sample) {
    return null;
  }

  const own = sample.last_modified_at
    ? parseTimestamp(sample.last_modified_at)
    : null;
  const recorded = confirmed.get(sample._id);

  if (own && recorded) {
    return toToken(recorded.getTime() > own.getTime() ? recorded : own);
  }

  const latest = own ?? recorded;

  return latest ? toToken(latest) : null;
};
