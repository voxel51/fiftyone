import { useReverbValueLoadable } from "@fiftyone/reverb";
import { useRef } from "react";
import { count } from "../atoms";

/**
 * How many samples the current view and filters hold, read without
 * suspending: null until the first count, then the last one while a new one
 * loads.
 */
const useViewCount = (): number | null => {
  const loadable = useReverbValueLoadable(
    count({ path: "", extended: true, modal: false }),
  );
  const last = useRef<number | null>(null);
  if (loadable.state === "hasValue") last.current = loadable.contents as number;
  return last.current;
};

export default useViewCount;
