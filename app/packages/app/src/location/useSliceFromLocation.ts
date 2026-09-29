/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useLocationParam } from "@fiftyone/location";
import { getSessionRef, useSetGroupSlice } from "@fiftyone/state";
import { useEffect } from "react";
import { sliceParam } from "./params";

/**
 * The URL owns the slice, so a move the App did not make (Back, Forward) is
 * applied from it. Setting through the session's writer tells the server too.
 */
export default function useSliceFromLocation() {
  const [slice] = useLocationParam(sliceParam);
  const setSlice = useSetGroupSlice();

  useEffect(() => {
    if (slice && slice !== getSessionRef().sessionGroupSlice) setSlice(slice);
  }, [setSlice, slice]);
}
