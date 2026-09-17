import { useReverbValue } from "@fiftyone/reverb";
import { timeZone } from "../atoms/selectors";

/**
 * Returns the app display timezone (`fo.config.timezone`, "UTC" by default)
 */
const useTimeZone = (): string => useReverbValue(timeZone);

export default useTimeZone;
