import { pathFilter, PathFilterSelector } from "@fiftyone/state";
import { useRef } from "react";
import { useRecoilValueLoadable } from "recoil";

export const usePathFilter = (): PathFilterSelector => {
  const fn = useRef<PathFilterSelector>(() => true);
  const loaded = useRecoilValueLoadable(pathFilter(true));

  if (loaded.state === "hasValue") {
    fn.current = loaded.contents;
  }

  return fn.current;
};
