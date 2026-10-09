/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useReverbValueLoadable } from "@fiftyone/reverb";
import { count, useLoadedViewName } from "@fiftyone/state";
import { useRef } from "react";

/**
 * What the samples on screen are: the loaded saved query's name, if any, and
 * how many samples the view and filters hold — read without suspending, the
 * last count staying while a new one loads.
 */
export default function useScope(): {
  name: string | null;
  total: number | null;
} {
  const name = useLoadedViewName();
  const loadable = useReverbValueLoadable(
    count({ path: "", extended: true, modal: false }),
  );
  const last = useRef<number | null>(null);
  if (loadable.state === "hasValue") last.current = loadable.contents as number;
  return { name, total: last.current };
}
