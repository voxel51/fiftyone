import { useReverbValue } from "@fiftyone/reverb";
import { viewName } from "../atoms";

/** The name of the saved view that is loaded, or null for none. */
const useLoadedViewName = (): string | null => useReverbValue(viewName) ?? null;

export default useLoadedViewName;
