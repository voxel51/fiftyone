import { useRecoilValue } from "recoil";
import { fields, State } from "../recoil";

/**
 * Returns the dataset's sample-space fields (schema metadata resolved by the
 * active view), sorted by field path.
 */
const useSampleFields = () =>
  useRecoilValue(fields({ space: State.SPACE.SAMPLE }));

export default useSampleFields;
