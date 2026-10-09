/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { locationBridge } from "@fiftyone/location";
import { useSessionSetter } from "@fiftyone/state";
import { useCallback } from "react";
import { sliceParam } from "../location/params";
import type { EventHandlerHook } from "./registerEvent";

/** The server moved the slice: take it, and put it in the URL, without echoing it back. */
const useSetGroupSlice: EventHandlerHook = () => {
  const setter = useSessionSetter();

  return useCallback(
    ({ slice }) => {
      setter("sessionGroupSlice", slice);
      locationBridge.current().write(sliceParam, slice);
    },
    [setter],
  );
};

export default useSetGroupSlice;
