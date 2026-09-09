import { useRecoilValue } from "recoil";
import { timeZone } from "../recoil/selectors";

/**
 * Returns the app display timezone (`fo.config.timezone`, "UTC" by default)
 */
const useTimeZone = (): string => useRecoilValue(timeZone);

export default useTimeZone;
