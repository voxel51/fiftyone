import { parseTimestamp } from "@fiftyone/core/src/client/util";
import type { Sample } from "@fiftyone/looker";

/**
 * Get a version token for a sample.
 *
 * A version token is a string which uniquely identifies a specific version of
 * a sample.
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
  if (!sample?.last_modified_at) {
    return null;
  }

  const isoTimestamp = parseTimestamp(sample.last_modified_at)?.toISOString();

  // server doesn't like the iso timestamp ending in 'Z'
  if (isoTimestamp?.endsWith("Z")) {
    return isoTimestamp.substring(0, isoTimestamp.length - 1);
  } else {
    return isoTimestamp ?? null;
  }
};
