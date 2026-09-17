import { type PathFilterSelector, pathFilter } from "@fiftyone/state";
import { useRef } from "react";
import { useReverbValueLoadable } from "@fiftyone/reverb";

export const usePathFilter = (): PathFilterSelector => {
  const fn = useRef<PathFilterSelector>(() => true);
  const loaded = useReverbValueLoadable(pathFilter(true));

  if (loaded.state === "hasValue") {
    fn.current = loaded.contents;
  }

  return fn.current;
};
