import { useRecoilValue } from "recoil";
import { fields, State } from "../recoil";

/**
 * Returns the dataset's sample-space fields (schema metadata resolved by the
 * active view), in schema order.
 */
const useSampleFields = () =>
  useRecoilValue(fields({ space: State.SPACE.SAMPLE }));

export default useSampleFields;
