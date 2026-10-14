import { parseTimestamp } from "@fiftyone/core/src/client/util";
import type { Sample } from "@fiftyone/looker";

/**
 * Freshest server-confirmed `last_modified_at` per sample id. The modal sample
 * only catches up after a refetch, so a write inside that window would
 * otherwise carry a stale token.
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
 * Get a sample's version token, or `null` when none can be determined. The
 * later of the sample's `last_modified_at` and the server-confirmed version
 * for that id wins.
 *
 * @param sample Sample for which to obtain a version token
 */
export const getSampleVersionToken = ({
  sample,
}: {
  sample: Sample | null;
}): string | null => {
  if (!sample?.last_modified_at) {
    return null;
  }

  const own = parseTimestamp(sample.last_modified_at);

  if (!own) {
    return null;
  }

  const recorded = confirmed.get(sample._id);

  return toToken(
    recorded && recorded.getTime() > own.getTime() ? recorded : own,
  );
};
