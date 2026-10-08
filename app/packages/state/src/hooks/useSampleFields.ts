import { useReverbValue } from "@fiftyone/reverb";
import { fields, State } from "../atoms";

/**
 * Returns the dataset's sample-space fields (schema metadata resolved by the
 * active view), sorted by field path.
 */
const useSampleFields = () =>
  useReverbValue(fields({ space: State.SPACE.SAMPLE }));

export default useSampleFields;
